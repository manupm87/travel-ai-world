from fastapi import APIRouter

from ai_api.api.v1.endpoints import chat, health, planner

# Everything under /ai so a reverse proxy can route this service by prefix.
api_router = APIRouter(prefix="/ai")
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(planner.router, prefix="/planner", tags=["Planner"])
api_router.include_router(health.router, prefix="/health", tags=["Health"])
