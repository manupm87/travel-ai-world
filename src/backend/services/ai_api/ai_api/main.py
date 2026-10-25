"""The ai_api ASGI app and the process-wide resources its lifespan builds."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from travel_common.dynamodb import dynamodb_client, ensure_table
from travel_common.http.app_factory import create_app

from ai_api.api.v1.api_router import api_router
from ai_api.application.access import CheckAccess
from ai_api.config import get_settings
from ai_api.infrastructure.commons_photos import CommonsPhotos
from ai_api.infrastructure.core_api_client import CoreApiClient
from ai_api.infrastructure.dynamo_traces import spec as interactions_spec
from ai_api.infrastructure.open_meteo import OpenMeteoForecast
from ai_api.infrastructure.providers import (
    build_eval_answerer,
    build_eval_store,
    build_input_guard,
    build_judge_provider,
    build_llm_provider,
    build_retriever,
    build_trace_log,
    build_usage_store,
    planner_cities,
)
from ai_api.infrastructure.site_previews import SitePreviews
from ai_api.openapi import register_stream_schemas


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Build the process-wide clients once per execution environment, not per request.

    The provider follows LLM_PROVIDER, the input guard BEDROCK_GUARDRAIL_ID and the
    retriever RETRIEVAL_ENABLED. The interactions table (ADR 0024) is created here
    only against a local endpoint; on AWS it is Terraform's.
    """
    settings = get_settings()
    if settings.INTERACTIONS_TABLE and settings.DYNAMODB_ENDPOINT_URL:
        await ensure_table(
            dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION),
            interactions_spec(settings.INTERACTIONS_TABLE),
        )
    provider = build_llm_provider(settings)
    retriever = build_retriever(settings)
    weather = OpenMeteoForecast.from_settings(settings)
    photos = CommonsPhotos.from_settings(settings) if settings.PHOTOS_ENABLED else None
    previews = (
        SitePreviews.from_settings(settings) if settings.SITE_PREVIEWS_ENABLED else None
    )
    app.state.llm_provider = provider
    app.state.input_guard = build_input_guard(settings)
    app.state.retriever = retriever
    app.state.weather = weather
    app.state.photos = photos
    app.state.previews = previews
    app.state.cities = planner_cities(settings)
    judge = build_judge_provider(settings)
    eval_answerer = build_eval_answerer(settings, provider)
    app.state.judge = judge
    app.state.eval_answerer = eval_answerer
    app.state.eval_store = build_eval_store(settings)
    app.state.trace_log = build_trace_log(settings)
    usage_store = build_usage_store(settings)
    app.state.usage_store = usage_store
    app.state.check_access = CheckAccess(
        CoreApiClient(settings.CORE_API_URL, settings.API_V1_STR),
        usage_store,
        ttl_seconds=settings.ACCESS_CACHE_SECONDS,
    )
    try:
        yield
    finally:
        await provider.aclose()
        await judge.aclose()
        if eval_answerer is not provider:
            await eval_answerer.aclose()
        if retriever is not None:
            await retriever.aclose()
        await weather.aclose()
        if photos is not None:
            await photos.aclose()
        if previews is not None:
            await previews.aclose()


settings = get_settings()
app = create_app(
    settings,
    [api_router],
    docs_prefix=f"{settings.API_V1_STR}{api_router.prefix}",
    lifespan=lifespan,
)
# the stream's event models, which no route declares, for `just contracts`
register_stream_schemas(app)
