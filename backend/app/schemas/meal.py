from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MealBase(BaseModel):
    time: Optional[str] = None
    type: Optional[str] = None  # e.g. "breakfast", "lunch", "dinner"
    restaurant_name: str
    cuisine: Optional[str] = None
    estimated_cost: Optional[Decimal] = None
    rating: Optional[float] = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_city: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class MealCreate(MealBase):
    pass


class MealUpdate(BaseModel):
    time: Optional[str] = None
    type: Optional[str] = None
    restaurant_name: Optional[str] = None
    cuisine: Optional[str] = None
    estimated_cost: Optional[Decimal] = None
    rating: Optional[float] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_city: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None


class MealResponse(MealBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
