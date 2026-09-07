from fastapi import APIRouter

from core_api.api.v1.endpoints import auth, health, trips, users
from core_api.api.v1.resources import CHILD_RESOURCES, child_router

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(trips.router, prefix="/trips", tags=["Trips"])
for resource in CHILD_RESOURCES:
    api_router.include_router(child_router(resource))
api_router.include_router(health.router, prefix="/health", tags=["Health"])
