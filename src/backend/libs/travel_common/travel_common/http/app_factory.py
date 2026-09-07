"""Build a FastAPI app the same way in every service.

CORS, the domain-error handlers and the versioned router prefix are the
same everywhere; only the routers and the settings differ.
"""

import logging
from collections.abc import Sequence
from contextlib import AbstractAsyncContextManager
from typing import Any, Callable

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from travel_common.config import CommonSettings
from travel_common.http.error_handlers import register_error_handlers

logger = logging.getLogger(__name__)


def create_app(
    settings: CommonSettings,
    routers: Sequence[APIRouter],
    *,
    docs_prefix: str = "",
    lifespan: Callable[[FastAPI], AbstractAsyncContextManager[Any]] | None = None,
) -> FastAPI:
    """Assemble the app.

    `lifespan` is the service's startup/shutdown context (engines, clients);
    resources it creates belong on `app.state`, never in module globals.

    `docs_prefix` is the URL prefix a reverse proxy routes to this service
    (e.g. "/api/v1/ai"). The OpenAPI document and the Swagger/ReDoc pages
    are served beneath it so another service behind the same origin does
    not shadow them. Empty means the default service: /docs, /redoc and
    {API_V1_STR}/openapi.json.
    """
    if not settings.SECRET_KEY:
        logger.warning(
            "SECRET_KEY is empty: issuing or verifying tokens will fail. "
            "Set it in this service's .env (same value in every service)."
        )

    base = docs_prefix.rstrip("/")
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        openapi_url=f"{base or settings.API_V1_STR}/openapi.json",
        docs_url=f"{base}/docs",
        redoc_url=f"{base}/redoc",
        lifespan=lifespan,
    )

    # CORS middleware must be registered before routers.
    # allow_credentials=True requires explicit origins (never "*").
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    for router in routers:
        app.include_router(router, prefix=settings.API_V1_STR)
    return app
