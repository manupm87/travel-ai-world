"""Request and response bodies of an itinerary day's meals."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.domain.enums import MealType
from core_api.schemas._partial import partial
from core_api.schemas._types import (
    CardJson,
    Latitude,
    Longitude,
    Money,
    PartOfDay,
    Rating,
    SourceRef,
    TimeOfDay,
    Title,
)


class MealBase(BaseModel):
    time: TimeOfDay | None = None
    part_of_day: PartOfDay | None = None
    type: MealType | None = None
    restaurant_name: Title
    cuisine: str | None = None
    estimated_cost: Money | None = None
    rating: Rating | None = None
    # flat location snapshot (the frontend's ActivityLocation)
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: Latitude | None = None
    location_lng: Longitude | None = None
    # the planner's offer, kept so a saved trip reopens in it (ADR 0019); opaque
    source_ref: SourceRef | None = None
    card: CardJson | None = None


class MealCreate(MealBase):
    pass


MealUpdate = partial(MealBase, "MealUpdate")


class MealResponse(MealBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
