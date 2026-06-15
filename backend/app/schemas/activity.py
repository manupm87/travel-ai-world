from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ActivityBase(BaseModel):
    time: Optional[str] = None
    duration_minutes: Optional[int] = None
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[Decimal] = None
    booking_required: bool = False
    booking_url: Optional[str] = None
    rating: Optional[float] = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_city: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    time: Optional[str] = None
    duration_minutes: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    cost: Optional[Decimal] = None
    booking_required: Optional[bool] = None
    booking_url: Optional[str] = None
    rating: Optional[float] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_city: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class ActivityResponse(ActivityBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
