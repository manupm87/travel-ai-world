from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial


class AccommodationBase(BaseModel):
    name: str
    type: str | None = None
    city: str | None = None
    country_code: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    check_in: date | None = None
    check_out: date | None = None
    rating: float | None = None
    price_per_night: Decimal | None = None
    total_cost: Decimal | None = None
    amenities: list[str] | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None


class AccommodationCreate(AccommodationBase):
    pass


AccommodationUpdate = partial(AccommodationBase, "AccommodationUpdate")


class AccommodationResponse(AccommodationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
