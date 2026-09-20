from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import (
    CardJson,
    CountryCode,
    Latitude,
    Longitude,
    Money,
    Rating,
    SourceRef,
    TimeOfDay,
    Title,
)


class AccommodationBase(BaseModel):
    name: Title
    type: str | None = None
    city: str | None = None
    country_code: CountryCode | None = None
    address: str | None = None
    lat: Latitude | None = None
    lng: Longitude | None = None
    check_in: date | None = None
    check_out: date | None = None
    rating: Rating | None = None
    price_per_night: Money | None = None
    total_cost: Money | None = None
    amenities: list[str] | None = None
    check_in_time: TimeOfDay | None = None
    check_out_time: TimeOfDay | None = None
    # What the planner offered, kept so a saved trip can be reopened in it
    # (ADR 0019). `card` is opaque to core_api.
    source_ref: SourceRef | None = None
    card: CardJson | None = None


class AccommodationCreate(AccommodationBase):
    pass


AccommodationUpdate = partial(AccommodationBase, "AccommodationUpdate")


class AccommodationResponse(AccommodationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
