from decimal import Decimal

from sqlalchemy import Float, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core_api.models.base import (
    Base,
    ItineraryDayChildMixin,
    LocationSnapshotMixin,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)


class Meal(
    UUIDPrimaryKeyMixin,
    ItineraryDayChildMixin,
    LocationSnapshotMixin,
    TimestampMixin,
    Base,
):
    __tablename__ = "meals"

    time: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "13:00"
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # MealType
    restaurant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cuisine: Mapped[str | None] = mapped_column(String(100), nullable=True)
    estimated_cost: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)

    itinerary_day: Mapped["ItineraryDay"] = relationship(  # noqa: F821
        back_populates="meals"
    )
