from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    TimestampMixin,
    TripChildMixin,
    UUIDPrimaryKeyMixin,
    ensure_ordered,
)

if TYPE_CHECKING:
    from core_api.models.trip import Trip


class Transportation(UUIDPrimaryKeyMixin, TripChildMixin, TimestampMixin, Base):
    __tablename__ = "transportations"

    type: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # TransportType
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    from_location: Mapped[str | None] = mapped_column(String(512), nullable=True)
    to_location: Mapped[str | None] = mapped_column(String(512), nullable=True)
    from_city: Mapped[str | None] = mapped_column(String(150), nullable=True)
    to_city: Mapped[str | None] = mapped_column(String(150), nullable=True)
    departure_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    arrival_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider: Mapped[str | None] = mapped_column(String(255), nullable=True)
    flight_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    booking_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="transportations")

    def check_invariants(self) -> None:
        ensure_ordered(self.departure_time, self.arrival_time, "Journey")
