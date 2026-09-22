"""FastAPI dependables: pagination, the table and its repositories, service
wiring, authentication, RBAC and the ownership boundaries (`get_owned_trip`,
`get_owned_itinerary_day`, `get_owned_chat_thread`)."""

from uuid import UUID

from fastapi import Depends, Query, Request
from travel_common.exceptions import Forbidden
from travel_common.http.auth import extract_bearer_token

from core_api.auth.google import GoogleTokenInfoVerifier, IdentityVerifier
from core_api.auth.principal import AccountPrincipal
from core_api.config import CoreSettings, get_settings
from core_api.domain.models import ChatThread, Trip
from core_api.domain.ports import (
    ChatMessageRepository,
    ChatThreadRepository,
    TripRepository,
    UserRepository,
)
from core_api.infrastructure.dynamo.repositories import (
    DynamoChatMessageRepository,
    DynamoChatThreadRepository,
    DynamoTripRepository,
    DynamoUserRepository,
)
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.pagination import MAX_PAGE_SIZE, Page
from core_api.services.auth_service import Authenticate, SignIn
from core_api.services.chat_message_service import ChatMessageService
from core_api.services.chat_thread_service import ChatThreadService
from core_api.services.trip_children import ITINERARY_DAYS, Located, get_child
from core_api.services.trip_service import TripService
from core_api.services.user_service import UserService

# ── Pagination ───────────────────────────────────────────────────────────────


def page_params(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
) -> Page:
    return Page(skip=skip, limit=limit)


# ── Storage and service wiring ───────────────────────────────────────────────
# The lifespan (`main.py`) builds the table handle once per process; tests
# override `get_table` with one over moto.


def get_table(request: Request) -> DynamoTable:
    return request.app.state.table


def get_user_repository(table: DynamoTable = Depends(get_table)) -> UserRepository:
    return DynamoUserRepository(table)


def get_trip_repository(table: DynamoTable = Depends(get_table)) -> TripRepository:
    return DynamoTripRepository(table)


def get_chat_thread_repository(
    table: DynamoTable = Depends(get_table),
) -> ChatThreadRepository:
    return DynamoChatThreadRepository(table)


def get_chat_message_repository(
    table: DynamoTable = Depends(get_table),
) -> ChatMessageRepository:
    return DynamoChatMessageRepository(table)


def get_user_service(
    users: UserRepository = Depends(get_user_repository),
) -> UserService:
    return UserService(users)


def get_trip_service(
    trips: TripRepository = Depends(get_trip_repository),
) -> TripService:
    return TripService(trips)


def get_chat_thread_service(
    threads: ChatThreadRepository = Depends(get_chat_thread_repository),
) -> ChatThreadService:
    return ChatThreadService(threads)


def get_chat_message_service(
    messages: ChatMessageRepository = Depends(get_chat_message_repository),
) -> ChatMessageService:
    return ChatMessageService(messages)


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
# owner's trip, so authorization happens once, here. The trip is read with
# the caller as its owner, so another user's trip is not found (404). Reads
# resolve the owned trip; writes resolve the *editable* one, because a trip
# that is happening now or already over is read-only (ADR 0019) — the entity
# says so and the endpoints never ask.


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


async def get_owned_trip_node(trip: Trip = Depends(get_owned_trip)) -> Located:
    """The trip as the holder of a trip-level collection (reads)."""
    return Located(trip=trip, parent=trip)


async def get_editable_trip_node(trip: Trip = Depends(get_editable_trip)) -> Located:
    """The trip as the holder of a trip-level collection (writes)."""
    return Located(trip=trip, parent=trip)


async def get_owned_itinerary_day(
    itinerary_day_id: UUID, trip: Trip = Depends(get_owned_trip)
) -> Located:
    """A day found inside the caller's trip, with the trip to save it by."""
    return Located(trip=trip, parent=get_child(trip, ITINERARY_DAYS, itinerary_day_id))


async def get_editable_itinerary_day(
    itinerary_day_id: UUID, trip: Trip = Depends(get_editable_trip)
) -> Located:
    """A day of an editable trip: the lock is checked before the day is read."""
    return Located(trip=trip, parent=get_child(trip, ITINERARY_DAYS, itinerary_day_id))


# ── Chat threads ─────────────────────────────────────────────────────────────
# A conversation is its own root, owned by a user like a trip (ADR 0013): its
# messages are reached through it, so authorization happens once, here.


async def get_owned_chat_thread(
    thread_id: UUID,
    principal: AccountPrincipal = Depends(get_current_user),
    threads: ChatThreadService = Depends(get_chat_thread_service),
) -> ChatThread:
    return await threads.get_owned(thread_id, principal)
