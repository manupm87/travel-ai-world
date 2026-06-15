from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DestinationBase(BaseModel):
    city: str
    country: str
    country_code: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    arrival_date: Optional[date] = None
    departure_date: Optional[date] = None
    nights_staying: Optional[int] = None


class DestinationCreate(DestinationBase):
    pass


class DestinationUpdate(BaseModel):
    city: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    arrival_date: Optional[date] = None
    departure_date: Optional[date] = None
    nights_staying: Optional[int] = None


class DestinationResponse(DestinationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
