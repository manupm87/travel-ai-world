from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from travel_common.http.app_factory import create_app

from ai_api.api.v1.api_router import api_router
from ai_api.config import get_settings
from ai_api.infrastructure.commons_photos import CommonsPhotos
from ai_api.infrastructure.open_meteo import OpenMeteoForecast
from ai_api.infrastructure.providers import (
    build_llm_provider,
    build_retriever,
    planner_cities,
)
from ai_api.infrastructure.site_previews import SitePreviews
from ai_api.openapi import register_stream_schemas


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """One provider (NVIDIA or Bedrock, per LLM_PROVIDER) and one client per process.

    The retriever, when RETRIEVAL_ENABLED, is built the same way: once per
    execution environment, with its own clients, never per request. The cities
    the planner covers are read once from the packaged manifest.
    """
    settings = get_settings()
    provider = build_llm_provider(settings)
    retriever = build_retriever(settings)
    weather = OpenMeteoForecast.from_settings(settings)
    photos = CommonsPhotos.from_settings(settings) if settings.PHOTOS_ENABLED else None
    previews = (
        SitePreviews.from_settings(settings) if settings.SITE_PREVIEWS_ENABLED else None
    )
    app.state.llm_provider = provider
    app.state.retriever = retriever
    app.state.weather = weather
    app.state.photos = photos
    app.state.previews = previews
    app.state.cities = planner_cities(settings)
    try:
        yield
    finally:
        await provider.aclose()
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
# The planner streams typed events no route declares (TRA-142): put them in
# the OpenAPI document so `just contracts` generates them for the frontend.
register_stream_schemas(app)
