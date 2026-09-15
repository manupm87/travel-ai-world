from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from travel_common.http.app_factory import create_app

from core_api.api.events import router as events_router
from core_api.api.v1.api_router import build_api_router
from core_api.config import get_settings
from core_api.db.session import build_engine, build_session_factory


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the database engine for the process; dispose it on shutdown."""
    engine = build_engine(get_settings())
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    try:
        yield
    finally:
        await engine.dispose()


app = create_app(get_settings(), [build_api_router(get_settings())], lifespan=lifespan)
# Root-level, not versioned: where the Lambda Web Adapter delivers direct invocations.
app.include_router(events_router)
