from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.trip import TripStatus
from app.schemas.accommodation import AccommodationResponse
from app.schemas.destination import DestinationResponse
from app.schemas.itinerary_day import ItineraryDayResponse
from app.schemas.transportation import TransportationResponse


# ---------------------------------------------------------------------------
# TripSummary — lightweight card used in list views (mirrors TripSummary.ts)
# ---------------------------------------------------------------------------


class TripSummaryResponse(BaseModel):
    id: UUID
    title: str
    status: TripStatus
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    image_url: Optional[str] = None
    # Convenience: list of destination city names
    destinations: List[str] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Full Trip CRUD schemas
# ---------------------------------------------------------------------------


class TripBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: TripStatus = TripStatus.PLANNING
    image_url: Optional[str] = None
    # Dates
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration_days: Optional[int] = None
    # Travelers (mirrors Trip.travelers in frontend)
    travelers_adults: int = 1
    travelers_children: int = 0
    travelers_infants: int = 0
    # Preferences
    travel_style: Optional[List[str]] = None
    pace_preference: Optional[str] = None
    accommodation_type: Optional[str] = None
    # Budget (mirrors Budget interface in frontend)
    budget_total: Optional[Decimal] = None
    budget_currency: Optional[str] = None
    budget_accommodation: Optional[Decimal] = None
    budget_food: Optional[Decimal] = None
    budget_activities: Optional[Decimal] = None
    budget_transportation: Optional[Decimal] = None
    budget_other: Optional[Decimal] = None
    # AI Insights (mirrors AIInsights in frontend)
    ai_weather_forecast: Optional[str] = None
    ai_local_tips: Optional[Union[List[str], str]] = None


class TripCreate(TripBase):
    pass


class TripUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TripStatus] = None
    image_url: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration_days: Optional[int] = None
    travelers_adults: Optional[int] = None
    travelers_children: Optional[int] = None
    travelers_infants: Optional[int] = None
    travel_style: Optional[List[str]] = None
    pace_preference: Optional[str] = None
    accommodation_type: Optional[str] = None
    budget_total: Optional[Decimal] = None
    budget_currency: Optional[str] = None
    budget_accommodation: Optional[Decimal] = None
    budget_food: Optional[Decimal] = None
    budget_activities: Optional[Decimal] = None
    budget_transportation: Optional[Decimal] = None
    budget_other: Optional[Decimal] = None
    ai_weather_forecast: Optional[str] = None
    ai_local_tips: Optional[Union[List[str], str]] = None


class TripResponse(TripBase):
    id: UUID
    user_id: int
    created_at: datetime
    updated_at: datetime
    # Nested relationships (mirrors the full Trip interface in frontend)
    destinations: List[DestinationResponse] = []
    itinerary: List[ItineraryDayResponse] = []
    accommodation: List[AccommodationResponse] = []
    transportation: List[TransportationResponse] = []

    model_config = ConfigDict(from_attributes=True)
