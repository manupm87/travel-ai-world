from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import (
    Latitude,
    Longitude,
    Money,
    PositiveMinutes,
    Rating,
    TimeOfDay,
    Title,
)


class ActivityBase(BaseModel):
    time: TimeOfDay | None = None
    duration_minutes: PositiveMinutes | None = None
    title: Title
    description: str | None = None
    category: str | None = None
    cost: Money | None = None
    booking_required: bool = False
    booking_url: str | None = None
    rating: Rating | None = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: Latitude | None = None
    location_lng: Longitude | None = None


class ActivityCreate(ActivityBase):
    pass


ActivityUpdate = partial(ActivityBase, "ActivityUpdate")


class ActivityResponse(ActivityBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
