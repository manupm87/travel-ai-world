import datetime as dt
import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    TimestampMixin,
    TripChildMixin,
    UUIDPrimaryKeyMixin,
)

if TYPE_CHECKING:
    from core_api.models.activity import Activity
    from core_api.models.destination import Destination
    from core_api.models.meal import Meal
    from core_api.models.trip import Trip


class ItineraryDay(UUIDPrimaryKeyMixin, TripChildMixin, TimestampMixin, Base):
    __tablename__ = "itinerary_days"

    # nullable: a day might not yet be tied to a specific destination
    destination_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )

    trip: Mapped["Trip"] = relationship(back_populates="itinerary_days")
    destination: Mapped["Destination | None"] = relationship(
        back_populates="itinerary_days"
    )
    activities: Mapped[list["Activity"]] = relationship(
        back_populates="itinerary_day", cascade="all, delete-orphan", lazy="selectin"
    )
    meals: Mapped[list["Meal"]] = relationship(
        back_populates="itinerary_day", cascade="all, delete-orphan", lazy="selectin"
    )
