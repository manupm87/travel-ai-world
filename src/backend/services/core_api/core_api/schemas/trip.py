from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.models.trip import TripStatus
from core_api.schemas._partial import partial
from core_api.schemas.accommodation import AccommodationResponse
from core_api.schemas.destination import DestinationResponse
from core_api.schemas.itinerary_day import ItineraryDayResponse
from core_api.schemas.transportation import TransportationResponse


class TripBase(BaseModel):
    title: str
    description: str | None = None
    status: TripStatus = TripStatus.PLANNING
    image_url: str | None = None
    # Dates
    start_date: date | None = None
    end_date: date | None = None
    duration_days: int | None = None
    # Travelers (mirrors Trip.travelers in frontend)
    travelers_adults: int = 1
    travelers_children: int = 0
    travelers_infants: int = 0
    # Preferences
    travel_style: list[str] | None = None
    pace_preference: str | None = None
    accommodation_type: str | None = None
    # Budget (mirrors Budget interface in frontend)
    budget_total: Decimal | None = None
    budget_currency: str | None = None
    budget_accommodation: Decimal | None = None
    budget_food: Decimal | None = None
    budget_activities: Decimal | None = None
    budget_transportation: Decimal | None = None
    budget_other: Decimal | None = None
    # AI Insights (mirrors AIInsights in frontend)
    ai_weather_forecast: str | None = None
    ai_local_tips: list[str] | str | None = None


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
