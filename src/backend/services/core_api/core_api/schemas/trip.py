from datetime import UTC, date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from core_api.models.trip import TripPhase, phase_of
from core_api.schemas._partial import partial
from core_api.schemas._types import (
    BudgetTier,
    CitySlug,
    Count,
    CountryCode,
    CurrencyCode,
    Latitude,
    Longitude,
    Money,
    Place,
    StringList,
    Title,
)
from core_api.schemas.accommodation import AccommodationResponse
from core_api.schemas.itinerary_day import ItineraryDayResponse
from core_api.schemas.transportation import TransportationResponse


class TripBase(BaseModel):
    title: Title
    description: str | None = None
    image_url: str | None = None
    # The one city this trip is about (ADR 0019). `city_slug` is the planner's
    # name for it and the key that reopens the trip in the planner.
    city_slug: CitySlug
    city: Place
    country: Place
    country_code: CountryCode
    lat: Latitude | None = None
    lng: Longitude | None = None
    origin: Place | None = None
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
    budget_tier: BudgetTier | None = None
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
    itinerary_days: list[ItineraryDayResponse] = []
    accommodations: list[AccommodationResponse] = []
    transportations: list[TransportationResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def phase(self) -> TripPhase:
        """Where the trip stands today, from its dates alone: nothing is
        stored, so a trip becomes ongoing and then past on its own."""
        return phase_of(self.start_date, self.end_date, datetime.now(UTC).date())
