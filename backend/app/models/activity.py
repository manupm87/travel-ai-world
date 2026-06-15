import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Activity(Base):
    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    itinerary_day_id = Column(
        UUID(as_uuid=True),
        ForeignKey("itinerary_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    time = Column(String(10), nullable=True)  # e.g. "09:00"
    duration_minutes = Column(Integer, nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    booking_required = Column(Boolean, nullable=False, default=False)
    booking_url = Column(String(512), nullable=True)
    rating = Column(Float, nullable=True)

    # ActivityLocation fields (flat — immutable snapshot)
    location_name = Column(String(255), nullable=True)
    location_address = Column(String(512), nullable=True)
    location_city = Column(String(150), nullable=True)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)

    # Relationships
    itinerary_day = relationship("ItineraryDay", back_populates="activities")
