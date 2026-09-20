"""FastAPI dependables: pagination, authentication, RBAC, service wiring and
the ownership boundaries (`get_owned_trip`, `get_owned_itinerary_day`,
`get_owned_chat_thread`)."""

from collections.abc import Callable
from typing import Any
from uuid import UUID

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from travel_common.exceptions import Forbidden
from travel_common.http.auth import extract_bearer_token

from core_api.auth.google import GoogleTokenInfoVerifier, IdentityVerifier
from core_api.auth.principal import AccountPrincipal
from core_api.config import CoreSettings, get_settings
from core_api.db.session import get_db
from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.base import Base
from core_api.models.chat_thread import ChatThread
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.trip import Trip
from core_api.pagination import MAX_PAGE_SIZE, Page
from core_api.repositories.base import BaseRepository
from core_api.repositories.chat_message_repository import ChatMessageRepository
from core_api.repositories.chat_thread_repository import ChatThreadRepository
from core_api.repositories.trip_repository import TripRepository
from core_api.repositories.user_repository import UserRepository
from core_api.services.auth_service import Authenticate, SignIn
from core_api.services.base import BaseService
from core_api.services.chat_message_service import ChatMessageService
from core_api.services.chat_thread_service import ChatThreadService
from core_api.services.trip_service import TripService
from core_api.services.user_service import UserService

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
get_itinerary_day_service = provide(BaseService, ItineraryDay)
get_activity_service = provide(BaseService, Activity)
get_meal_service = provide(BaseService, Meal)
get_accommodation_service = provide(BaseService, Accommodation)
get_transportation_service = provide(BaseService, Transportation)
get_chat_thread_service = provide(
    ChatThreadService, ChatThreadRepository.model, ChatThreadRepository
)
get_chat_message_service = provide(
    ChatMessageService, ChatMessageRepository.model, ChatMessageRepository
)

# ── Authentication ───────────────────────────────────────────────────────────


def get_authenticate(
    users: UserService = Depends(get_user_service),
    settings: CoreSettings = Depends(get_settings),
) -> Authenticate:
    return Authenticate(users, settings)


async def get_current_user(
    token: str = Depends(extract_bearer_token),
    authenticate: Authenticate = Depends(get_authenticate),
) -> AccountPrincipal:
    """The account behind the bearer token; 401 when the token or the account
    is no good. Local tokens are looked up, Cognito tokens are upserted."""
    return await authenticate(token)


async def get_current_admin_user(
    principal: AccountPrincipal = Depends(get_current_user),
) -> AccountPrincipal:
    if not principal.is_admin:
        raise Forbidden("The user doesn't have enough privileges")
    return principal


# ── Sign-in ──────────────────────────────────────────────────────────────────


def get_identity_verifier(
    settings: CoreSettings = Depends(get_settings),
) -> IdentityVerifier:
    return GoogleTokenInfoVerifier(settings.GOOGLE_CLIENT_ID)


def get_sign_in(
    verifier: IdentityVerifier = Depends(get_identity_verifier),
    users: UserService = Depends(get_user_service),
    settings: CoreSettings = Depends(get_settings),
) -> SignIn:
    return SignIn(verifier, users, settings)


# ── Aggregate boundary ───────────────────────────────────────────────────────
# A trip is the aggregate root: every child resource is reached through the
# owner's trip, so authorization happens once, here. Reads resolve the owned
# trip; writes resolve the *editable* one, because a trip that is happening
# now or already over is read-only (ADR 0019) — the entity says so and the
# endpoints never ask.


async def get_owned_trip(
    trip_id: UUID,
    principal: AccountPrincipal = Depends(get_current_user),
    trips: TripService = Depends(get_trip_service),
) -> Trip:
    return await trips.get_owned(trip_id, principal)


async def get_editable_trip(trip: Trip = Depends(get_owned_trip)) -> Trip:
    """The caller's trip, refused with `TripLocked` unless it is still ahead."""
    trip.ensure_editable()
    return trip


async def get_owned_itinerary_day(
    itinerary_day_id: UUID,
    trip: Trip = Depends(get_owned_trip),
    days: BaseService[ItineraryDay, Any, Any] = Depends(get_itinerary_day_service),
) -> ItineraryDay:
    return await days.get_in(itinerary_day_id, trip_id=trip.id)


async def get_editable_itinerary_day(
    itinerary_day_id: UUID,
    trip: Trip = Depends(get_editable_trip),
    days: BaseService[ItineraryDay, Any, Any] = Depends(get_itinerary_day_service),
) -> ItineraryDay:
    """A day of an editable trip: the lock is checked before the day is read."""
    return await days.get_in(itinerary_day_id, trip_id=trip.id)


# ── Chat threads ─────────────────────────────────────────────────────────────
# A conversation is its own root, owned by a user like a trip (ADR 0013): its
# messages are reached through it, so authorization happens once, here.


async def get_owned_chat_thread(
    thread_id: UUID,
    principal: AccountPrincipal = Depends(get_current_user),
    threads: ChatThreadService = Depends(get_chat_thread_service),
) -> ChatThread:
    return await threads.get_owned(thread_id, principal)
