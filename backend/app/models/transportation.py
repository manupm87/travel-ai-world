import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Transportation(Base):
    __tablename__ = "transportations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    trip_id = Column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    type = Column(String(100), nullable=True)  # flight / train / bus …
    category = Column(String(100), nullable=True)  # e.g. "economy"
    from_location = Column(String(512), nullable=True)
    to_location = Column(String(512), nullable=True)
    from_city = Column(String(150), nullable=True)
    to_city = Column(String(150), nullable=True)
    departure_time = Column(DateTime(timezone=True), nullable=True)
    arrival_time = Column(DateTime(timezone=True), nullable=True)
    provider = Column(String(255), nullable=True)
    flight_number = Column(
        String(50), nullable=True
    )  # nullable — non-flights won't have one
    duration_minutes = Column(Integer, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    booking_reference = Column(String(100), nullable=True)

    # Relationships
    trip = relationship("Trip", back_populates="transportations")
