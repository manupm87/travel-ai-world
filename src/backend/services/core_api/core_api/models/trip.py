from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import ARRAY, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
    ensure_ordered,
)
from core_api.models.enums import TripStatus

if TYPE_CHECKING:
    from core_api.models.accommodation import Accommodation
    from core_api.models.destination import Destination
    from core_api.models.itinerary_day import ItineraryDay
    from core_api.models.transportation import Transportation
    from core_api.models.user import User


__all__ = ["Trip", "TripStatus"]


class Trip(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Aggregate root: everything a user plans for one journey."""

    __tablename__ = "trips"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Core fields
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TripStatus] = mapped_column(
        SQLEnum(TripStatus), nullable=False, default=TripStatus.PLANNING
    )
    image_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

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
    destinations: Mapped[list["Destination"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )
    itinerary_days: Mapped[list["ItineraryDay"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )
    accommodations: Mapped[list["Accommodation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )
    transportations: Mapped[list["Transportation"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", lazy="selectin"
    )

    def check_invariants(self) -> None:
        ensure_ordered(self.start_date, self.end_date, "Trip dates")
