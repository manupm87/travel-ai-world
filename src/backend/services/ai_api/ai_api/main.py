from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from ai_api.api.v1.api_router import api_router
from ai_api.config import get_settings
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from travel_common.http.app_factory import create_app


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """One provider (and one HTTP connection pool) for the whole process."""
    provider = NvidiaProvider.from_settings(get_settings())
    app.state.llm_provider = provider
    try:
        yield
    finally:
        await provider.aclose()


settings = get_settings()
app = create_app(
    settings,
    [api_router],
    docs_prefix=f"{settings.API_V1_STR}{api_router.prefix}",
    lifespan=lifespan,
)
