from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TransportationBase(BaseModel):
    type: Optional[str] = None  # e.g. "flight", "train", "bus"
    category: Optional[str] = None  # e.g. "outbound", "return", "internal"
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    from_city: Optional[str] = None
    to_city: Optional[str] = None
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    provider: Optional[str] = None
    flight_number: Optional[str] = None
    duration_minutes: Optional[int] = None
    cost: Optional[Decimal] = None
    booking_reference: Optional[str] = None


class TransportationCreate(TransportationBase):
    pass


class TransportationUpdate(BaseModel):
    type: Optional[str] = None
    category: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    from_city: Optional[str] = None
    to_city: Optional[str] = None
    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None
    provider: Optional[str] = None
    flight_number: Optional[str] = None
    duration_minutes: Optional[int] = None
    cost: Optional[Decimal] = None
    booking_reference: Optional[str] = None


class TransportationResponse(TransportationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
