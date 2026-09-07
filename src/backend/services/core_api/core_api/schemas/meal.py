from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.models.enums import MealType
from core_api.schemas._partial import partial
from core_api.schemas._types import (
    Latitude,
    Longitude,
    Money,
    Rating,
    TimeOfDay,
    Title,
)


class MealBase(BaseModel):
    time: TimeOfDay | None = None
    type: MealType | None = None
    restaurant_name: Title
    cuisine: str | None = None
    estimated_cost: Money | None = None
    rating: Rating | None = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: Latitude | None = None
    location_lng: Longitude | None = None


class MealCreate(MealBase):
    pass


MealUpdate = partial(MealBase, "MealUpdate")


class MealResponse(MealBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
