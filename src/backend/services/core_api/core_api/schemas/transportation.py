from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.models.enums import TransportCategory, TransportType
from core_api.schemas._partial import partial
from core_api.schemas._types import Money, PositiveMinutes


class TransportationBase(BaseModel):
    type: TransportType | None = None
    category: TransportCategory | None = None
    from_location: str | None = None
    to_location: str | None = None
    from_city: str | None = None
    to_city: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    provider: str | None = None
    flight_number: str | None = None
    duration_minutes: PositiveMinutes | None = None
    cost: Money | None = None
    booking_reference: str | None = None


class TransportationCreate(TransportationBase):
    pass


TransportationUpdate = partial(TransportationBase, "TransportationUpdate")


class TransportationResponse(TransportationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
