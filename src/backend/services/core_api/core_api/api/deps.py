"""FastAPI dependables: pagination, authentication, RBAC, service wiring and
the aggregate boundary (`get_owned_trip`, `get_owned_itinerary_day`)."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core_api.config import settings
from core_api.db.session import get_db
from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.base import Base
from core_api.models.destination import Destination
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.trip import Trip
from core_api.pagination import MAX_PAGE_SIZE, Page
from core_api.repositories.base import BaseRepository
from core_api.repositories.trip_repository import TripRepository
from core_api.repositories.user_repository import UserRepository
from core_api.services.base import BaseService
from core_api.services.trip_service import TripService
from core_api.services.user_service import UserService
from travel_common.exceptions import Forbidden
from travel_common.http.auth import extract_bearer_token
from travel_common.principal import Principal
from travel_common.security import principal_from_token

# ── Pagination ───────────────────────────────────────────────────────────────


def page_params(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
) -> Page:
    return Page(skip=skip, limit=limit)


# ── Service wiring ───────────────────────────────────────────────────────────


def provide[S](
    service_cls: Callable[[Any], S],
    model: type[Base],
    repository_cls: type[BaseRepository[Any]] = BaseRepository,
) -> Callable[..., S]:
    """Build a `Depends`-able that wires `service_cls(repository_cls(db, model))`.

    Entities without custom queries or rules use the generic classes directly;
    only pass a subclass when the entity needs more.
    """

    def _provider(db: AsyncSession = Depends(get_db)) -> S:
        return service_cls(repository_cls(db, model))

    _provider.__name__ = f"get_{model.__name__.lower()}_service"
    return _provider


get_user_service = provide(UserService, UserRepository.model, UserRepository)
get_trip_service = provide(TripService, TripRepository.model, TripRepository)
get_destination_service = provide(BaseService, Destination)
get_itinerary_day_service = provide(BaseService, ItineraryDay)
get_activity_service = provide(BaseService, Activity)
get_meal_service = provide(BaseService, Meal)
get_accommodation_service = provide(BaseService, Accommodation)
get_transportation_service = provide(BaseService, Transportation)

# ── Authentication ───────────────────────────────────────────────────────────


async def get_current_user(
    token: str = Depends(extract_bearer_token),
    user_service: UserService = Depends(get_user_service),
) -> Principal:
    """Verify the JWT, then confirm the account still exists and is active.

    The database is the source of truth for role and status: a revoked or
    demoted user is cut off immediately, not when the token expires.
    """
    claims = principal_from_token(token, settings)
    user = await user_service.get_active(claims.id)
    return Principal(id=user.id, email=user.email, role=user.role)


async def get_current_admin_user(
    principal: Principal = Depends(get_current_user),
) -> Principal:
    if not principal.is_admin:
        raise Forbidden("The user doesn't have enough privileges")
    return principal


# ── Aggregate boundary ───────────────────────────────────────────────────────
# A trip is the aggregate root: every child resource is reached through the
# owner's trip, so authorization happens once, here.


async def get_owned_trip(
    trip_id: UUID,
    principal: Principal = Depends(get_current_user),
    trips: TripService = Depends(get_trip_service),
) -> Trip:
    return await trips.get_owned(trip_id, principal)


async def get_owned_itinerary_day(
    itinerary_day_id: UUID,
    trip: Trip = Depends(get_owned_trip),
    days: BaseService[ItineraryDay, Any, Any] = Depends(get_itinerary_day_service),
) -> ItineraryDay:
    return await days.get_in(itinerary_day_id, trip_id=trip.id)
