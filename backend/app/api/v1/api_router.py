from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    chat,
    users,
    health,
    trips,
    destinations,
    itinerary_days,
    activities,
    meals,
    accommodations,
    transportations,
)

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(trips.router, prefix="/trips", tags=["Trips"])
api_router.include_router(
    destinations.router, prefix="/destinations", tags=["Destinations"]
)
api_router.include_router(
    itinerary_days.router, prefix="/itinerary-days", tags=["Itinerary Days"]
)
api_router.include_router(activities.router, prefix="/activities", tags=["Activities"])
api_router.include_router(meals.router, prefix="/meals", tags=["Meals"])
api_router.include_router(
    accommodations.router, prefix="/accommodations", tags=["Accommodations"]
)
api_router.include_router(
    transportations.router, prefix="/transportations", tags=["Transportations"]
)
api_router.include_router(health.router, prefix="/health", tags=["Health"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
