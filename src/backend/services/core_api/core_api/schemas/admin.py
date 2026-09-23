"""The admin reads (ADR 0024): every trip and every account, a page at a time.

No optional wire fields: a nullable value is always present, `null` when
there is none. `next_cursor` is opaque; `null` means the last page.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from core_api.domain.models import TripPhase
from core_api.schemas.user import UserResponse


class AdminTripSummary(BaseModel):
    """A trip as GSI2 projects it: its owner, dates, and the planner session."""

    id: UUID
    user_id: UUID
    title: str
    city_slug: str
    city: str
    country_code: str
    start_date: date | None
    end_date: date | None
    image_url: str | None
    created_at: datetime
    updated_at: datetime
    planner_session_id: str | None
    phase: TripPhase

    model_config = ConfigDict(from_attributes=True)


class AdminTripPage(BaseModel):
    items: list[AdminTripSummary]
    next_cursor: str | None


class AdminUserPage(BaseModel):
    items: list[UserResponse]
    next_cursor: str | None
