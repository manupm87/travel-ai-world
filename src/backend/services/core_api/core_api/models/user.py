from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from travel_common.principal import Role

from core_api.models.base import Base

if TYPE_CHECKING:
    from core_api.models.trip import Trip


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    role: Mapped[Role] = mapped_column(
        SQLEnum(Role, name="userrole"), default=Role.USER, nullable=False
    )

    # Google OAuth fields (primary auth mechanism)
    auth_provider: Mapped[str] = mapped_column(String, default="google", nullable=False)
    google_id: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    picture: Mapped[str | None] = mapped_column(String, nullable=True)

    trips: Mapped[list["Trip"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
