from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core_api.api.v1.api_router import api_router
from core_api.config import get_settings
from core_api.db.session import build_engine, build_session_factory
from travel_common.http.app_factory import create_app


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


app = create_app(get_settings(), [api_router], lifespan=lifespan)
