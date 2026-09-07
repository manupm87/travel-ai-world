from datetime import date

from sqlalchemy import Date, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    CoordinatesMixin,
    TimestampMixin,
    TripChildMixin,
    UUIDPrimaryKeyMixin,
    ensure_ordered,
)


class Destination(
    UUIDPrimaryKeyMixin, TripChildMixin, CoordinatesMixin, TimestampMixin, Base
):
    __tablename__ = "destinations"

    city: Mapped[str] = mapped_column(String(150), nullable=False)
    country: Mapped[str] = mapped_column(String(150), nullable=False)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)  # ISO 3166-1

    arrival_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    departure_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    nights_staying: Mapped[int | None] = mapped_column(Integer, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="destinations")  # noqa: F821
    itinerary_days: Mapped[list["ItineraryDay"]] = relationship(  # noqa: F821
        back_populates="destination"
    )

    def check_invariants(self) -> None:
        ensure_ordered(self.arrival_date, self.departure_date, "Stay")
