from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Float, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    ItineraryDayChildMixin,
    LocationSnapshotMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)

if TYPE_CHECKING:
    from core_api.models.itinerary_day import ItineraryDay


class Activity(
    UUIDPrimaryKeyMixin,
    ItineraryDayChildMixin,
    LocationSnapshotMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "activities"

    time: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "09:00"
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    booking_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    booking_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)

    itinerary_day: Mapped["ItineraryDay"] = relationship(back_populates="activities")
