from datetime import UTC, date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Literal

from sqlalchemy import (
    Date,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from travel_common.exceptions import TripLocked

from core_api.models.base import (
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    ensure_ordered,
)

if TYPE_CHECKING:
    from core_api.models.accommodation import Accommodation
    from core_api.models.itinerary_day import ItineraryDay
    from core_api.models.transportation import Transportation
    from core_api.models.user import User


__all__ = ["Trip", "TripPhase", "phase_of"]


TripPhase = Literal["upcoming", "ongoing", "past"]
"""Where a trip stands relative to today. Derived, never stored (ADR 0019)."""


def phase_of(start: date | None, end: date | None, today: date) -> TripPhase:
    """The phase of a trip running from `start` to `end`, seen from `today`.

    `past` once the end date is behind us, `ongoing` while today falls inside
    the dates (both boundary days included; an open end means it has not
    finished yet), `upcoming` for anything else — a trip still being planned,
    with no dates at all or with dates still ahead.
    """
    if end is not None and end < today:
        return "past"
    if start is not None and start <= today and (end is None or today <= end):
        return "ongoing"
    return "upcoming"


class Trip(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Aggregate root: everything a user plans for one city (ADR 0019)."""

    __tablename__ = "trips"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Core fields
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # The one city this trip is about. `city_slug` is how the planner names it
    # in the corpus ("budapest"), and therefore the key that reopens the trip.
    city_slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    city: Mapped[str] = mapped_column(String(150), nullable=False)
    country: Mapped[str] = mapped_column(String(150), nullable=False)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)  # ISO 3166-1
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Where the traveller leaves from, in their own words ("Madrid").
    origin: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Dates
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Travelers
    travelers_adults: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    travelers_children: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    travelers_infants: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Preferences
    travel_style: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    pace_preference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    accommodation_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # The planner's budget tier: 1 cheap, 2 mid, 3 splurge.
    budget_tier: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Budget (inline value object; ISO 4217 currency)
    budget_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    budget_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    budget_accommodation: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    budget_food: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    budget_activities: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    budget_transportation: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    budget_other: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # AI insights (inline, optional)
    ai_weather_forecast: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_local_tips: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Relationships. Children load eagerly: the API always returns the whole
    # aggregate and lazy loads are not possible from an async serializer.
    user: Mapped["User"] = relationship(back_populates="trips")
    itinerary_days: Mapped[list["ItineraryDay"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )
    accommodations: Mapped[list["Accommodation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )
    transportations: Mapped[list["Transportation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def phase(self) -> TripPhase:
        """Today's phase, on the server's UTC date. Not a column: the day
        changes on its own and nothing has to be written for it to."""
        return phase_of(self.start_date, self.end_date, datetime.now(UTC).date())

    def ensure_editable(self) -> None:
        """A trip that is happening now, or already over, is a record of what
        was planned: it and everything inside it are read-only (ADR 0019).
        Deleting it is still allowed — that is not a change, it is a removal.
        """
        phase = self.phase
        if phase != "upcoming":
            raise TripLocked(phase=phase)

    def check_invariants(self) -> None:
        ensure_ordered(self.start_date, self.end_date, "Trip dates")
