import uuid

from sqlalchemy import Column, Date, Float, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship

from app.models.base import Base


class Accommodation(Base):
    __tablename__ = "accommodations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    trip_id = Column(
        UUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    check_in = Column(Date, nullable=True)
    check_out = Column(Date, nullable=True)
    name = Column(String(255), nullable=False)
    type = Column(String(100), nullable=True)  # hotel / hostel / apartment …
    city = Column(String(150), nullable=True)
    country_code = Column(String(3), nullable=True)
    address = Column(String(512), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    rating = Column(Float, nullable=True)
    price_per_night = Column(Numeric(10, 2), nullable=True)
    total_cost = Column(Numeric(12, 2), nullable=True)
    amenities = Column(ARRAY(String), nullable=True)  # e.g. ["WiFi", "Pool"]
    check_in_time = Column(String(10), nullable=True)  # e.g. "15:00"
    check_out_time = Column(String(10), nullable=True)  # e.g. "11:00"

    # Relationships
    trip = relationship("Trip", back_populates="accommodations")
