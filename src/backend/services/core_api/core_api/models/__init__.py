# Re-export all models so that a single import of this package is sufficient
# for Alembic autogenerate to detect every table registered on Base.metadata.
from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.destination import Destination
from core_api.models.enums import (
    MealType,
    TransportCategory,
    TransportType,
    TripStatus,
)
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.trip import Trip
from core_api.models.user import User

__all__ = [
    "Accommodation",
    "Activity",
    "Destination",
    "ItineraryDay",
    "Meal",
    "MealType",
    "TransportCategory",
    "TransportType",
    "Transportation",
    "Trip",
    "TripStatus",
    "User",
]
