from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Float, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    CoordinatesMixin,
    TimestampMixin,
    TripChildMixin,
    UUIDPrimaryKeyMixin,
    ensure_ordered,
)


class Accommodation(
    UUIDPrimaryKeyMixin, TripChildMixin, CoordinatesMixin, TimestampMixin, Base
):
    __tablename__ = "accommodations"

    check_in: Mapped[date | None] = mapped_column(Date, nullable=True)
    check_out: Mapped[date | None] = mapped_column(Date, nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(100), nullable=True)  # hotel…
    city: Mapped[str | None] = mapped_column(String(150), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_per_night: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    amenities: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    check_in_time: Mapped[str | None] = mapped_column(String(10), nullable=True)
    check_out_time: Mapped[str | None] = mapped_column(String(10), nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="accommodations")  # noqa: F821

    def check_invariants(self) -> None:
        ensure_ordered(self.check_in, self.check_out, "Stay")
