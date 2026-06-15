import enum

from sqlalchemy import Boolean, Column, Enum as SQLEnum, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(SQLEnum(UserRole), default=UserRole.USER, nullable=False)

    # Google OAuth fields (primary auth mechanism)
    auth_provider = Column(String, default="google", nullable=False)
    google_id = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=True)
    picture = Column(String, nullable=True)

    # Relationships
    trips = relationship("Trip", back_populates="user", cascade="all, delete-orphan")
