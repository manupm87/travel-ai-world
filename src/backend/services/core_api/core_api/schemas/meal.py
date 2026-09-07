from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial


class MealBase(BaseModel):
    time: str | None = None
    type: str | None = None  # e.g. "breakfast", "lunch", "dinner"
    restaurant_name: str
    cuisine: str | None = None
    estimated_cost: Decimal | None = None
    rating: float | None = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None


class MealCreate(MealBase):
    pass


MealUpdate = partial(MealBase, "MealUpdate")


class MealResponse(MealBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
