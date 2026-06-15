import uuid

from sqlalchemy import Column, Date, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Destination(Base):
    __tablename__ = "destinations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    trip_id = Column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    city = Column(String(150), nullable=False)
    country = Column(String(150), nullable=False)
    country_code = Column(String(3), nullable=False)  # ISO 3166-1 alpha-2/3

    # Coordinates (no PostGIS dependency at this stage)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    arrival_date = Column(Date, nullable=True)
    departure_date = Column(Date, nullable=True)
    nights_staying = Column(Integer, nullable=True)

    # Relationships
    trip = relationship("Trip", back_populates="destinations")
    itinerary_days = relationship("ItineraryDay", back_populates="destination")
