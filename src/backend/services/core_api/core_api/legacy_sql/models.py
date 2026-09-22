"""Read-only source for `copy-from-postgres`; deleted with RDS in TRA-219.

The PostgreSQL tables as the last Alembic revision (`9d3400b9db7a`) left
them, reduced to what the copy reads: columns and the trip's child
relationships (loaded eagerly). `Base.metadata.create_all` rebuilds the same
schema for `tests/test_ops_copy.py`.
"""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import ARRAY, JSON, JSONB, UUID
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    declared_attr,
    mapped_column,
    relationship,
)
from travel_common.principal import Role


class Base(DeclarativeBase):
    pass


class _Id:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class _Timestamps:
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class _TripChild:
    @declared_attr
    def trip_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE")
        )


class _DayChild:
    @declared_attr
    def itinerary_day_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True), ForeignKey("itinerary_days.id", ondelete="CASCADE")
        )


class _Location:
    location_name: Mapped[str | None] = mapped_column(String(255))
    location_address: Mapped[str | None] = mapped_column(String(512))
    location_city: Mapped[str | None] = mapped_column(String(150))
    location_lat: Mapped[float | None] = mapped_column(Float)
    location_lng: Mapped[float | None] = mapped_column(Float)


class _Card:
    source_ref: Mapped[str | None] = mapped_column(String(255))
    card: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[Role] = mapped_column(
        SQLEnum(Role, name="userrole"), default=Role.USER, nullable=False
    )
    auth_provider: Mapped[str] = mapped_column(String, default="google")
    google_id: Mapped[str | None] = mapped_column(String, unique=True)
    name: Mapped[str | None] = mapped_column(String)
    picture: Mapped[str | None] = mapped_column(String)


class Activity(_Id, _DayChild, _Location, _Card, _Timestamps, Base):
    __tablename__ = "activities"

    part_of_day: Mapped[str | None] = mapped_column(String(16))
    time: Mapped[str | None] = mapped_column(String(10))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    booking_required: Mapped[bool] = mapped_column(Boolean, default=False)
    booking_url: Mapped[str | None] = mapped_column(String(512))
    rating: Mapped[float | None] = mapped_column(Float)


class Meal(_Id, _DayChild, _Location, _Card, _Timestamps, Base):
    __tablename__ = "meals"

    part_of_day: Mapped[str | None] = mapped_column(String(16))
    time: Mapped[str | None] = mapped_column(String(10))
    type: Mapped[str | None] = mapped_column(String(50))
    restaurant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    cuisine: Mapped[str | None] = mapped_column(String(100))
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    rating: Mapped[float | None] = mapped_column(Float)


class ItineraryDay(_Id, _TripChild, _Timestamps, Base):
    __tablename__ = "itinerary_days"

    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[dt.date | None] = mapped_column(Date)
    title: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    activities: Mapped[list[Activity]] = relationship(
        lazy="selectin", order_by="Activity.created_at"
    )
    meals: Mapped[list[Meal]] = relationship(
        lazy="selectin", order_by="Meal.created_at"
    )


class Accommodation(_Id, _TripChild, _Card, _Timestamps, Base):
    __tablename__ = "accommodations"

    check_in: Mapped[dt.date | None] = mapped_column(Date)
    check_out: Mapped[dt.date | None] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str | None] = mapped_column(String(100))
    city: Mapped[str | None] = mapped_column(String(150))
    country_code: Mapped[str | None] = mapped_column(String(3))
    address: Mapped[str | None] = mapped_column(String(512))
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    rating: Mapped[float | None] = mapped_column(Float)
    price_per_night: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amenities: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    check_in_time: Mapped[str | None] = mapped_column(String(10))
    check_out_time: Mapped[str | None] = mapped_column(String(10))


class Transportation(_Id, _TripChild, _Timestamps, Base):
    __tablename__ = "transportations"

    type: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(100))
    from_location: Mapped[str | None] = mapped_column(String(512))
    to_location: Mapped[str | None] = mapped_column(String(512))
    from_city: Mapped[str | None] = mapped_column(String(150))
    to_city: Mapped[str | None] = mapped_column(String(150))
    departure_time: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    arrival_time: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    provider: Mapped[str | None] = mapped_column(String(255))
    flight_number: Mapped[str | None] = mapped_column(String(50))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    booking_reference: Mapped[str | None] = mapped_column(String(100))


class Trip(_Id, _Timestamps, Base):
    __tablename__ = "trips"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(512))
    city_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(150), nullable=False)
    country: Mapped[str] = mapped_column(String(150), nullable=False)
    country_code: Mapped[str] = mapped_column(String(3), nullable=False)
    lat: Mapped[float | None] = mapped_column(Float)
    lng: Mapped[float | None] = mapped_column(Float)
    origin: Mapped[str | None] = mapped_column(String(150))
    start_date: Mapped[dt.date | None] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    duration_days: Mapped[int | None] = mapped_column(Integer)
    travelers_adults: Mapped[int] = mapped_column(Integer, default=1)
    travelers_children: Mapped[int] = mapped_column(Integer, default=0)
    travelers_infants: Mapped[int] = mapped_column(Integer, default=0)
    travel_style: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    pace_preference: Mapped[str | None] = mapped_column(String(100))
    accommodation_type: Mapped[str | None] = mapped_column(String(100))
    budget_tier: Mapped[int | None] = mapped_column(SmallInteger)
    budget_total: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_currency: Mapped[str | None] = mapped_column(String(3))
    budget_accommodation: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_food: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_activities: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_transportation: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    budget_other: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    ai_weather_forecast: Mapped[str | None] = mapped_column(Text)
    ai_local_tips: Mapped[list[str] | None] = mapped_column(JSON)

    itinerary_days: Mapped[list[ItineraryDay]] = relationship(
        lazy="selectin", order_by="ItineraryDay.created_at"
    )
    accommodations: Mapped[list[Accommodation]] = relationship(
        lazy="selectin", order_by="Accommodation.created_at"
    )
    transportations: Mapped[list[Transportation]] = relationship(
        lazy="selectin", order_by="Transportation.created_at"
    )


class ChatThread(_Id, _Timestamps, Base):
    __tablename__ = "chat_threads"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))


class ChatMessage(_Id, Base):
    __tablename__ = "chat_messages"

    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    model: Mapped[str | None] = mapped_column(String(200))
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False
    )
