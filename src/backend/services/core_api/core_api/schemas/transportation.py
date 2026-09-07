from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial


class TransportationBase(BaseModel):
    type: str | None = None  # e.g. "flight", "train", "bus"
    category: str | None = None  # e.g. "outbound", "return", "internal"
    from_location: str | None = None
    to_location: str | None = None
    from_city: str | None = None
    to_city: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    provider: str | None = None
    flight_number: str | None = None
    duration_minutes: int | None = None
    cost: Decimal | None = None
    booking_reference: str | None = None


class TransportationCreate(TransportationBase):
    pass


TransportationUpdate = partial(TransportationBase, "TransportationUpdate")


class TransportationResponse(TransportationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
