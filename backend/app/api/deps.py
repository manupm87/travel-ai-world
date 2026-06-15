from fastapi import Depends
import jwt
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import UnauthorizedException
from app.db.session import get_db
from app.models.user import User, UserRole
from app.services.user_service import UserService
from app.services.trip_service import TripService
from app.services.destination_service import DestinationService
from app.services.itinerary_day_service import ItineraryDayService
from app.services.activity_service import ActivityService
from app.services.meal_service import MealService
from app.services.accommodation_service import AccommodationService
from app.services.transportation_service import TransportationService

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Google OAuth flow — tokens are issued by POST /auth/google, not a password form.
_bearer_scheme = HTTPBearer(auto_error=False)


async def _extract_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """Extract the Bearer token from the Authorization header."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedException(detail="Missing or invalid authorization header")
    return credentials.credentials


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(_extract_token),
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = payload.get("sub")
        if token_data is None:
            raise UnauthorizedException(detail="Invalid authentication credentials")
    except (jwt.InvalidTokenError, ValidationError):
        raise UnauthorizedException(detail="Invalid or expired token")

    user_service = UserService(db)
    user = await user_service.get_user_by_id(user_id=int(token_data))
    if not user:
        # 401, not 404: avoids leaking which user IDs exist in the database
        raise UnauthorizedException(detail="Invalid authentication credentials")
    if not user.is_active:
        raise UnauthorizedException(detail="Inactive user account")
    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.role != UserRole.ADMIN:
        raise UnauthorizedException(detail="The user doesn't have enough privileges")
    return current_user


def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    """Provides a UserService instance via FastAPI dependency injection."""
    return UserService(db)


def get_trip_service(db: AsyncSession = Depends(get_db)) -> TripService:
    return TripService(db)


def get_destination_service(db: AsyncSession = Depends(get_db)) -> DestinationService:
    return DestinationService(db)


def get_itinerary_day_service(
    db: AsyncSession = Depends(get_db),
) -> ItineraryDayService:
    return ItineraryDayService(db)


def get_activity_service(db: AsyncSession = Depends(get_db)) -> ActivityService:
    return ActivityService(db)


def get_meal_service(db: AsyncSession = Depends(get_db)) -> MealService:
    return MealService(db)


def get_accommodation_service(
    db: AsyncSession = Depends(get_db),
) -> AccommodationService:
    return AccommodationService(db)


def get_transportation_service(
    db: AsyncSession = Depends(get_db),
) -> TransportationService:
    return TransportationService(db)
