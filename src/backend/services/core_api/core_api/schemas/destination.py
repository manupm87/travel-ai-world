from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import Count, CountryCode, Latitude, Longitude, Title


class DestinationBase(BaseModel):
    city: Title
    country: Title
    country_code: CountryCode
    lat: Latitude | None = None
    lng: Longitude | None = None
    arrival_date: date | None = None
    departure_date: date | None = None
    nights_staying: Count | None = None


class DestinationCreate(DestinationBase):
    pass


DestinationUpdate = partial(DestinationBase, "DestinationUpdate")


class DestinationResponse(DestinationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
