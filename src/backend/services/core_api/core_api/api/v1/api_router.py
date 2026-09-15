from fastapi import APIRouter

from core_api.api.v1.endpoints import auth, health, trips, users
from core_api.api.v1.resources import CHILD_RESOURCES, child_router
from core_api.config import CoreSettings


def build_api_router(settings: CoreSettings) -> APIRouter:
    """The versioned API. `/auth/*` only exists in local mode: with Cognito the
    pool issues the tokens and this service never does."""
    api_router = APIRouter()
    if settings.AUTH_MODE == "local":
        api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
    api_router.include_router(users.router, prefix="/users", tags=["Users"])
    api_router.include_router(trips.router, prefix="/trips", tags=["Trips"])
    for resource in CHILD_RESOURCES:
        api_router.include_router(child_router(resource))
    api_router.include_router(health.router, prefix="/health", tags=["Health"])
    return api_router
