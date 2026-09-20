"""Declarative base and the column groups every table shares.

SQLAlchemy 2 typed style (`Mapped[...]` + `mapped_column`) so type checkers
know the attribute types. Import `Base` in every model file and in Alembic's
`env.py`; mix in only what the table needs.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column
from travel_common.exceptions import UnprocessableEntity


class Base(DeclarativeBase):
    """Single shared Base for ALL SQLAlchemy models.

    Entities own their rules: override `check_invariants` to raise a domain
    error when the row, taken as a whole, is not valid. Services call it
    before every create and update, so a PATCH cannot break a rule that a
    POST enforces.
    """

    def check_invariants(self) -> None:
        return None


def ensure_ordered[D: (date, datetime)](
    start: D | None, end: D | None, what: str
) -> None:
    if start is not None and end is not None and end < start:
        raise UnprocessableEntity(f"{what}: end must not be before start")


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TripChildMixin:
    """A row that belongs to one trip and disappears with it."""

    @declared_attr
    def trip_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )


class ItineraryDayChildMixin:
    """A row that belongs to one day of the itinerary."""

    @declared_attr
    def itinerary_day_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            ForeignKey("itinerary_days.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        )


class CoordinatesMixin:
    """WGS84 point without a PostGIS dependency."""

    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)


class LocationSnapshotMixin:
    """Denormalised place details captured when the row was created."""

    location_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(150), nullable=True)
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)


class PlannerCardMixin:
    """The planner card a row was created from, kept as the client sent it.

    `source_ref` is the corpus document id behind the card (`osm:relation/13067`),
    indexed so a trip can be matched back to what the planner offered. `card`
    is the card itself: an opaque JSON object that core_api stores and returns
    untouched — its shape is ai_api's (`OptionCard`) and this service never
    looks inside it.
    """

    source_ref: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    card: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class PartOfDayMixin:
    """Which part of the day the planner put this row in: `morning`,
    `afternoon`, `evening` or `night` (the schema holds the vocabulary)."""

    part_of_day: Mapped[str | None] = mapped_column(String(16), nullable=True)
