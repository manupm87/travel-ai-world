import uuid

from sqlalchemy import Column, Float, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Meal(Base):
    __tablename__ = "meals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    itinerary_day_id = Column(
        UUID(as_uuid=True),
        ForeignKey("itinerary_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    time = Column(String(10), nullable=True)  # e.g. "13:00"
    type = Column(String(50), nullable=True)  # breakfast / lunch / dinner
    restaurant_name = Column(String(255), nullable=False)
    cuisine = Column(String(100), nullable=True)
    estimated_cost = Column(Numeric(10, 2), nullable=True)
    rating = Column(Float, nullable=True)

    # ActivityLocation fields (flat — immutable snapshot, same pattern as Activity)
    location_name = Column(String(255), nullable=True)
    location_address = Column(String(512), nullable=True)
    location_city = Column(String(150), nullable=True)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)

    # Relationships
    itinerary_day = relationship("ItineraryDay", back_populates="meals")
