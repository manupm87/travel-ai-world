# Re-export all schemas for convenient single-package imports.
from app.schemas.user import (
    UserBase,
    UserUpdate,
    UserRoleUpdate,
    UserResponse,
)  # noqa: F401
from app.schemas.destination import (
    DestinationBase,
    DestinationCreate,
    DestinationUpdate,
    DestinationResponse,
)  # noqa: F401
from app.schemas.activity import (
    ActivityBase,
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
)  # noqa: F401
from app.schemas.meal import MealBase, MealCreate, MealUpdate, MealResponse  # noqa: F401
from app.schemas.accommodation import (
    AccommodationBase,
    AccommodationCreate,
    AccommodationUpdate,
    AccommodationResponse,
)  # noqa: F401
from app.schemas.transportation import (
    TransportationBase,
    TransportationCreate,
    TransportationUpdate,
    TransportationResponse,
)  # noqa: F401
from app.schemas.itinerary_day import (
    ItineraryDayBase,
    ItineraryDayCreate,
    ItineraryDayUpdate,
    ItineraryDayResponse,
)  # noqa: F401
from app.schemas.trip import (
    TripBase,
    TripCreate,
    TripUpdate,
    TripResponse,
    TripSummaryResponse,
)  # noqa: F401

__all__ = [
    # User
    "UserBase",
    "UserUpdate",
    "UserRoleUpdate",
    "UserResponse",
    # Destination
    "DestinationBase",
    "DestinationCreate",
    "DestinationUpdate",
    "DestinationResponse",
    # Activity
    "ActivityBase",
    "ActivityCreate",
    "ActivityUpdate",
    "ActivityResponse",
    # Meal
    "MealBase",
    "MealCreate",
    "MealUpdate",
    "MealResponse",
    # Accommodation
    "AccommodationBase",
    "AccommodationCreate",
    "AccommodationUpdate",
    "AccommodationResponse",
    # Transportation
    "TransportationBase",
    "TransportationCreate",
    "TransportationUpdate",
    "TransportationResponse",
    # ItineraryDay
    "ItineraryDayBase",
    "ItineraryDayCreate",
    "ItineraryDayUpdate",
    "ItineraryDayResponse",
    # Trip
    "TripBase",
    "TripCreate",
    "TripUpdate",
    "TripResponse",
    "TripSummaryResponse",
]
