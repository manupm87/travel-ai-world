from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial


class DestinationBase(BaseModel):
    city: str
    country: str
    country_code: str
    lat: float | None = None
    lng: float | None = None
    arrival_date: date | None = None
    departure_date: date | None = None
    nights_staying: int | None = None


class DestinationCreate(DestinationBase):
    pass


DestinationUpdate = partial(DestinationBase, "DestinationUpdate")


class DestinationResponse(DestinationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
