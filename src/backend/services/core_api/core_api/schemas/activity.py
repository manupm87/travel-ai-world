from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial
from core_api.schemas._types import (
    CardJson,
    Latitude,
    Longitude,
    Money,
    PartOfDay,
    PositiveMinutes,
    Rating,
    SourceRef,
    TimeOfDay,
    Title,
)


class ActivityBase(BaseModel):
    time: TimeOfDay | None = None
    part_of_day: PartOfDay | None = None
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
    # What the planner offered, kept so a saved trip can be reopened in it
    # (ADR 0019). `card` is opaque to core_api.
    source_ref: SourceRef | None = None
    card: CardJson | None = None


class ActivityCreate(ActivityBase):
    pass


ActivityUpdate = partial(ActivityBase, "ActivityUpdate")


class ActivityResponse(ActivityBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
