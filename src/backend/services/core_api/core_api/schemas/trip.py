from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.models.enums import TripStatus
from core_api.schemas._partial import partial
from core_api.schemas._types import Count, CurrencyCode, Money, StringList, Title
from core_api.schemas.accommodation import AccommodationResponse
from core_api.schemas.destination import DestinationResponse
from core_api.schemas.itinerary_day import ItineraryDayResponse
from core_api.schemas.transportation import TransportationResponse


class TripBase(BaseModel):
    title: Title
    description: str | None = None
    status: TripStatus = TripStatus.PLANNING
    image_url: str | None = None
    # Dates (start <= end is enforced by the Trip entity)
    start_date: date | None = None
    end_date: date | None = None
    duration_days: Count | None = None
    # Travelers
    travelers_adults: Count = 1
    travelers_children: Count = 0
    travelers_infants: Count = 0
    # Preferences
    travel_style: list[str] | None = None
    pace_preference: str | None = None
    accommodation_type: str | None = None
    # Budget
    budget_total: Money | None = None
    budget_currency: CurrencyCode | None = None
    budget_accommodation: Money | None = None
    budget_food: Money | None = None
    budget_activities: Money | None = None
    budget_transportation: Money | None = None
    budget_other: Money | None = None
    # AI insights
    ai_weather_forecast: str | None = None
    ai_local_tips: StringList | None = None


class TripCreate(TripBase):
    pass


TripUpdate = partial(TripBase, "TripUpdate")


class TripResponse(TripBase):
    id: UUID
    user_id: int
    created_at: datetime
    updated_at: datetime
    # Nested relationships — names match the ORM attributes so they populate.
    destinations: list[DestinationResponse] = []
    itinerary_days: list[ItineraryDayResponse] = []
    accommodations: list[AccommodationResponse] = []
    transportations: list[TransportationResponse] = []

    model_config = ConfigDict(from_attributes=True)
