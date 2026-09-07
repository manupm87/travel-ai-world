from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.schemas._partial import partial


class ActivityBase(BaseModel):
    time: str | None = None
    duration_minutes: int | None = None
    title: str
    description: str | None = None
    category: str | None = None
    cost: Decimal | None = None
    booking_required: bool = False
    booking_url: str | None = None
    rating: float | None = None
    # Flat location snapshot (mirrors ActivityLocation in frontend)
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None


class ActivityCreate(ActivityBase):
    pass


ActivityUpdate = partial(ActivityBase, "ActivityUpdate")


class ActivityResponse(ActivityBase):
    id: UUID
    itinerary_day_id: UUID

    model_config = ConfigDict(from_attributes=True)
