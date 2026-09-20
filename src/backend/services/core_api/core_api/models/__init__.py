# Re-export all models so that a single import of this package is sufficient
# for Alembic autogenerate to detect every table registered on Base.metadata.
from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.chat_message import ChatMessage
from core_api.models.chat_thread import ChatThread
from core_api.models.enums import (
    ChatRole,
    MealType,
    TransportCategory,
    TransportType,
)
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.trip import Trip, TripPhase, phase_of
from core_api.models.user import User

__all__ = [
    "Accommodation",
    "Activity",
    "ChatMessage",
    "ChatRole",
    "ChatThread",
    "ItineraryDay",
    "Meal",
    "MealType",
    "TransportCategory",
    "TransportType",
    "Transportation",
    "Trip",
    "TripPhase",
    "User",
    "phase_of",
]
