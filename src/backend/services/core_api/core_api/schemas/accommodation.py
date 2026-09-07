from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import (
    CountryCode,
    Latitude,
    Longitude,
    Money,
    Rating,
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


class AccommodationCreate(AccommodationBase):
    pass


AccommodationUpdate = partial(AccommodationBase, "AccommodationUpdate")


class AccommodationResponse(AccommodationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
