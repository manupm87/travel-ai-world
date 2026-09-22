from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from travel_common.http.app_factory import create_app

from core_api.api.v1.api_router import build_api_router
from core_api.config import get_settings
from core_api.infrastructure.dynamo.table import open_table


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Open the DynamoDB table for the process (ADR 0023). The boto3 client
    holds no connection pool to dispose, so shutdown has nothing to do."""
    app.state.table = await open_table(get_settings())
    yield


app = create_app(get_settings(), [build_api_router(get_settings())], lifespan=lifespan)
