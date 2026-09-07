import datetime as dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from core_api.schemas._partial import partial
from core_api.schemas._types import Money
from core_api.schemas.activity import ActivityResponse
from core_api.schemas.meal import MealResponse


class ItineraryDayBase(BaseModel):
    day_number: int = Field(ge=1)
    date: dt.date | None = None
    title: str | None = None
    description: str | None = None
    estimated_cost: Money | None = None
    destination_id: UUID | None = None


class ItineraryDayCreate(ItineraryDayBase):
    pass


ItineraryDayUpdate = partial(ItineraryDayBase, "ItineraryDayUpdate")


class ItineraryDayResponse(ItineraryDayBase):
    id: UUID
    trip_id: UUID
    activities: list[ActivityResponse] = []
    meals: list[MealResponse] = []

    model_config = ConfigDict(from_attributes=True)
