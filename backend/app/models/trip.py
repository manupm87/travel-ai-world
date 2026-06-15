import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.models.base import Base


class TripStatus(str, enum.Enum):
    PLANNING = "planning"
    PLANNED = "planned"
    FINISHED = "finished"


class Trip(Base):
    __tablename__ = "trips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Core fields
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(SQLEnum(TripStatus), nullable=False, default=TripStatus.PLANNING)
    image_url = Column(String(512), nullable=True)

    # Dates
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    duration_days = Column(Integer, nullable=True)

    # Travelers
    travelers_adults = Column(Integer, nullable=False, default=1)
    travelers_children = Column(Integer, nullable=False, default=0)
    travelers_infants = Column(Integer, nullable=False, default=0)

    # Preferences
    travel_style = Column(ARRAY(String), nullable=True)  # stored as native PG array
    pace_preference = Column(String(100), nullable=True)
    accommodation_type = Column(String(100), nullable=True)

    # Budget (inline — 1-to-1 value object, no separate table needed)
    budget_total = Column(Numeric(12, 2), nullable=True)
    budget_currency = Column(String(3), nullable=True)  # ISO 4217
    budget_accommodation = Column(Numeric(12, 2), nullable=True)
    budget_food = Column(Numeric(12, 2), nullable=True)
    budget_activities = Column(Numeric(12, 2), nullable=True)
    budget_transportation = Column(Numeric(12, 2), nullable=True)
    budget_other = Column(Numeric(12, 2), nullable=True)

    # AI Insights (inline — 1-to-1, optional)
    ai_weather_forecast = Column(Text, nullable=True)
    ai_local_tips = Column(JSON, nullable=True)  # str | str[]

    # Audit timestamps
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    user = relationship("User", back_populates="trips")
    destinations = relationship(
        "Destination", back_populates="trip", cascade="all, delete-orphan"
    )
    itinerary_days = relationship(
        "ItineraryDay", back_populates="trip", cascade="all, delete-orphan"
    )
    accommodations = relationship(
        "Accommodation", back_populates="trip", cascade="all, delete-orphan"
    )
    transportations = relationship(
        "Transportation", back_populates="trip", cascade="all, delete-orphan"
    )
