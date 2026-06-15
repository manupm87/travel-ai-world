import uuid

from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class ItineraryDay(Base):
    __tablename__ = "itinerary_days"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    trip_id = Column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # nullable: a day might not yet be tied to a specific destination
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    day_number = Column(Integer, nullable=False)
    date = Column(Date, nullable=True)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    estimated_cost = Column(Numeric(12, 2), nullable=True)

    # Relationships
    trip = relationship("Trip", back_populates="itinerary_days")
    destination = relationship("Destination", back_populates="itinerary_days")
    activities = relationship(
        "Activity", back_populates="itinerary_day", cascade="all, delete-orphan"
    )
    meals = relationship(
        "Meal", back_populates="itinerary_day", cascade="all, delete-orphan"
    )
