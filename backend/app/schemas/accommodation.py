from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AccommodationBase(BaseModel):
    name: str
    type: Optional[str] = None
    city: Optional[str] = None
    country_code: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    check_in: Optional[date] = None
    check_out: Optional[date] = None
    rating: Optional[float] = None
    price_per_night: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    amenities: Optional[List[str]] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None


class AccommodationCreate(AccommodationBase):
    pass


class AccommodationUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    city: Optional[str] = None
    country_code: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    check_in: Optional[date] = None
    check_out: Optional[date] = None
    rating: Optional[float] = None
    price_per_night: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    amenities: Optional[List[str]] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None


class AccommodationResponse(AccommodationBase):
    id: UUID
    trip_id: UUID

    model_config = ConfigDict(from_attributes=True)
