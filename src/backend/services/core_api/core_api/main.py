"""The FastAPI application: the table opened in the lifespan, routers, metrics."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from travel_common.http.app_factory import create_app

from core_api.api.v1.api_router import build_api_router
from core_api.config import CoreSettings, get_settings
from core_api.infrastructure.dynamo.table import open_table
from core_api.observability.business_events import configure_business_events
from core_api.observability.business_metrics import configure_metrics


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the DynamoDB table for the process (ADR 0023).

    The boto3 client holds no connection pool, so shutdown has nothing to close.
    """
    app.state.table = await open_table(app.state.settings)
    yield


def build_app(settings: CoreSettings) -> FastAPI:
    """The service's composition root, local metrics included when enabled."""
    application = create_app(settings, [build_api_router(settings)], lifespan=lifespan)
    application.state.settings = settings
    configure_metrics(application, settings)
    configure_business_events(application, settings)
    return application


app = build_app(get_settings())
