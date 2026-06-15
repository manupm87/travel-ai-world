from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas.activity import ActivityResponse
from app.schemas.meal import MealResponse


class ItineraryDayBase(BaseModel):
    day_number: int
    date: Optional[date] = None
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_cost: Optional[Decimal] = None


class ItineraryDayCreate(ItineraryDayBase):
    destination_id: Optional[UUID] = None


class ItineraryDayUpdate(BaseModel):
    day_number: Optional[int] = None
    date: Optional[date] = None
    title: Optional[str] = None
    description: Optional[str] = None
    estimated_cost: Optional[Decimal] = None
    destination_id: Optional[UUID] = None


class ItineraryDayResponse(ItineraryDayBase):
    id: UUID
    trip_id: UUID
    destination_id: Optional[UUID] = None
    activities: List[ActivityResponse] = []
    meals: List[MealResponse] = []

    model_config = ConfigDict(from_attributes=True)
