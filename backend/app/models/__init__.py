# Re-export all models so that a single import of this package is sufficient
# for Alembic autogenerate to detect every table registered on Base.metadata.
from app.models.user import User  # noqa: F401
from app.models.trip import Trip, TripStatus  # noqa: F401
from app.models.destination import Destination  # noqa: F401
from app.models.itinerary_day import ItineraryDay  # noqa: F401
from app.models.activity import Activity  # noqa: F401
from app.models.meal import Meal  # noqa: F401
from app.models.accommodation import Accommodation  # noqa: F401
from app.models.transportation import Transportation  # noqa: F401

__all__ = [
    "User",
    "Trip",
    "TripStatus",
    "Destination",
    "ItineraryDay",
    "Activity",
    "Meal",
    "Accommodation",
    "Transportation",
]
