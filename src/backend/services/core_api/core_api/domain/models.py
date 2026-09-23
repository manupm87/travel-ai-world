"""The entities `core_api` keeps, as plain dataclasses (ADR 0023).

They mirror the former ORM tables field for field, so the response schemas
populate from them with `from_attributes=True`. Ids are UUIDs (`User.id` as
well: it was an integer on PostgreSQL), timestamps are aware UTC datetimes
set by the application, money is `Decimal`.

Two aggregates own everything else:

- `Trip` (ADR 0005, ADR 0019) embeds its days, stays and journeys, and each
  day embeds its activities and meals. The whole tree is stored and loaded
  as one item.
- `ChatThread` (ADR 0013) is stored without its messages; `ChatMessage`s
  are an append-only log beside it.

Entities own their rules: `check_invariants` raises a domain error when the
entity, taken as a whole, is not valid. Services call it before every create
and update, so a PATCH cannot break a rule that a POST enforces.

`version` (profile, trip, thread) is the optimistic-concurrency counter the
repositories check on every write; it is not part of any response.
"""

import datetime as dt
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, Literal

from travel_common.exceptions import TripLocked, UnprocessableEntity
from travel_common.principal import Role

from core_api.domain.enums import ChatRole

__all__ = [
    "Accommodation",
    "Activity",
    "ChatMessage",
    "ChatThread",
    "Entity",
    "ItineraryDay",
    "Meal",
    "Transportation",
    "Trip",
    "TripPhase",
    "TripSummary",
    "User",
    "ensure_ordered",
    "phase_of",
    "utc_now",
]


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_ordered[D: (date, datetime)](
    start: D | None, end: D | None, what: str
) -> None:
    if start is not None and end is not None and end < start:
        raise UnprocessableEntity(f"{what}: end must not be before start")


TripPhase = Literal["upcoming", "ongoing", "past"]
"""Where a trip stands relative to today. Derived, never stored (ADR 0019)."""


def phase_of(start: date | None, end: date | None, today: date) -> TripPhase:
    """The phase of a trip running from `start` to `end`, seen from `today`.

    `past` once the end date is behind us, `ongoing` while today falls inside
    the dates (both boundary days included; an open end means it has not
    finished yet), `upcoming` for anything else — a trip still being planned,
    with no dates at all or with dates still ahead.
    """
    if end is not None and end < today:
        return "past"
    if start is not None and start <= today and (end is None or today <= end):
        return "ongoing"
    return "upcoming"


@dataclass(slots=True, kw_only=True)
class Entity:
    """Every entity has a UUID and may declare rules over its own fields."""

    id: uuid.UUID = field(default_factory=uuid.uuid4)

    def check_invariants(self) -> None:
        return None


@dataclass(slots=True, kw_only=True)
class TimestampedEntity(Entity):
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


# ── Accounts ────────────────────────────────────────────────────────────────


@dataclass(slots=True, kw_only=True)
class User(Entity):
    email: str
    is_active: bool = True
    role: Role = Role.USER
    # Google OAuth / Cognito profile (both identify the account by its email).
    auth_provider: str = "google"
    google_id: str | None = None
    name: str | None = None
    picture: str | None = None
    # The token `sub` this account signs in with (ADR 0024): the Cognito sub
    # in production, the account id as text in local mode. The AI traces name
    # users by it, never by their email.
    subject: str | None = None
    version: int = 0


# ── The trip aggregate ──────────────────────────────────────────────────────


@dataclass(slots=True, kw_only=True)
class Activity(TimestampedEntity):
    itinerary_day_id: uuid.UUID
    time: str | None = None  # "09:00"
    duration_minutes: int | None = None
    title: str
    description: str | None = None
    category: str | None = None
    cost: Decimal | None = None
    booking_required: bool = False
    booking_url: str | None = None
    rating: float | None = None
    # Denormalised place details captured when the activity was planned.
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    # The planner card it came from: `source_ref` is the corpus id, `card` an
    # opaque JSON object core_api stores and returns untouched.
    source_ref: str | None = None
    card: dict[str, Any] | None = None
    part_of_day: str | None = None


@dataclass(slots=True, kw_only=True)
class Meal(TimestampedEntity):
    itinerary_day_id: uuid.UUID
    time: str | None = None  # "13:00"
    type: str | None = None  # MealType
    restaurant_name: str
    cuisine: str | None = None
    estimated_cost: Decimal | None = None
    rating: float | None = None
    location_name: str | None = None
    location_address: str | None = None
    location_city: str | None = None
    location_lat: float | None = None
    location_lng: float | None = None
    source_ref: str | None = None
    card: dict[str, Any] | None = None
    part_of_day: str | None = None


@dataclass(slots=True, kw_only=True)
class ItineraryDay(TimestampedEntity):
    trip_id: uuid.UUID
    day_number: int
    date: dt.date | None = None
    title: str | None = None
    description: str | None = None
    estimated_cost: Decimal | None = None
    activities: list[Activity] = field(default_factory=list)
    meals: list[Meal] = field(default_factory=list)


@dataclass(slots=True, kw_only=True)
class Accommodation(TimestampedEntity):
    trip_id: uuid.UUID
    check_in: date | None = None
    check_out: date | None = None
    name: str
    type: str | None = None  # hotel, apartment, ...
    city: str | None = None
    country_code: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    rating: float | None = None
    price_per_night: Decimal | None = None
    total_cost: Decimal | None = None
    amenities: list[str] | None = None
    check_in_time: str | None = None
    check_out_time: str | None = None
    source_ref: str | None = None
    card: dict[str, Any] | None = None

    def check_invariants(self) -> None:
        ensure_ordered(self.check_in, self.check_out, "Stay")


@dataclass(slots=True, kw_only=True)
class Transportation(TimestampedEntity):
    trip_id: uuid.UUID
    type: str | None = None  # TransportType
    category: str | None = None  # TransportCategory
    from_location: str | None = None
    to_location: str | None = None
    from_city: str | None = None
    to_city: str | None = None
    departure_time: datetime | None = None
    arrival_time: datetime | None = None
    provider: str | None = None
    flight_number: str | None = None
    duration_minutes: int | None = None
    cost: Decimal | None = None
    booking_reference: str | None = None

    def check_invariants(self) -> None:
        ensure_ordered(self.departure_time, self.arrival_time, "Journey")


@dataclass(slots=True, kw_only=True)
class Trip(TimestampedEntity):
    """Aggregate root: everything a user plans for one city (ADR 0019)."""

    user_id: uuid.UUID

    # Core fields
    title: str
    description: str | None = None
    image_url: str | None = None

    # The one city this trip is about. `city_slug` is how the planner names it
    # in the corpus ("budapest"), and therefore the key that reopens the trip.
    city_slug: str
    city: str
    country: str
    country_code: str  # ISO 3166-1
    lat: float | None = None
    lng: float | None = None
    # Where the traveller leaves from, in their own words ("Madrid").
    origin: str | None = None

    # Dates
    start_date: date | None = None
    end_date: date | None = None
    duration_days: int | None = None

    # Travelers
    travelers_adults: int = 1
    travelers_children: int = 0
    travelers_infants: int = 0

    # Preferences
    travel_style: list[str] | None = None
    pace_preference: str | None = None
    accommodation_type: str | None = None
    # The planner's budget tier: 1 cheap, 2 mid, 3 splurge.
    budget_tier: int | None = None

    # Budget (inline value object; ISO 4217 currency)
    budget_total: Decimal | None = None
    budget_currency: str | None = None
    budget_accommodation: Decimal | None = None
    budget_food: Decimal | None = None
    budget_activities: Decimal | None = None
    budget_transportation: Decimal | None = None
    budget_other: Decimal | None = None

    # AI insights (inline, optional)
    ai_weather_forecast: str | None = None
    ai_local_tips: list[str] | None = None

    # The planner draft this trip was saved from (a UUID as text, ADR 0024):
    # it links the trip to the AI turns that made it.
    planner_session_id: str | None = None

    # The rest of the aggregate, stored inside the trip.
    itinerary_days: list[ItineraryDay] = field(default_factory=list)
    accommodations: list[Accommodation] = field(default_factory=list)
    transportations: list[Transportation] = field(default_factory=list)

    version: int = 0

    @property
    def phase(self) -> TripPhase:
        """Today's phase, on the server's UTC date. Not a field: the day
        changes on its own and nothing has to be written for it to."""
        return phase_of(self.start_date, self.end_date, utc_now().date())

    def ensure_editable(self) -> None:
        """A trip that is happening now, or already over, is a record of what
        was planned: it and everything inside it are read-only (ADR 0019).
        Deleting it is still allowed — that is not a change, it is a removal.
        """
        phase = self.phase
        if phase != "upcoming":
            raise TripLocked(phase=phase)

    def check_invariants(self) -> None:
        ensure_ordered(self.start_date, self.end_date, "Trip dates")


@dataclass(slots=True, kw_only=True)
class TripSummary:
    """What the admin list shows of a trip: the fields GSI2 projects (ADR 0024).

    Read from the index, never saved: the trip itself is the `Trip` item.
    """

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    city_slug: str
    city: str
    country_code: str
    start_date: date | None = None
    end_date: date | None = None
    image_url: str | None = None
    created_at: datetime
    updated_at: datetime
    planner_session_id: str | None = None

    @property
    def phase(self) -> TripPhase:
        return phase_of(self.start_date, self.end_date, utc_now().date())


# ── Conversations ───────────────────────────────────────────────────────────


@dataclass(slots=True, kw_only=True)
class ChatThread(TimestampedEntity):
    """One conversation with the assistant, private to the user who owns it.

    `updated_at` moves with every appended message, so a user's list shows the
    most recent conversations first (ADR 0013).
    """

    user_id: uuid.UUID
    title: str | None = None
    # Corpus city slug ("madrid", "berlin", "budapest"); None for a general chat.
    city: str | None = None
    version: int = 0


@dataclass(slots=True, kw_only=True)
class ChatMessage(Entity):
    """One turn of a conversation: appended, never edited.

    An assistant answer keeps what it was grounded on (`sources`), the model
    that wrote it and what it cost (`input_tokens`, `output_tokens`,
    `latency_ms`), so a conversation can be reviewed afterwards.
    """

    thread_id: uuid.UUID
    role: str  # ChatRole
    content: str
    # [{"doc_id", "score", "title", "url"}, ...] for answers built on the corpus.
    sources: list[dict[str, Any]] | None = None
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None
    created_at: datetime = field(default_factory=utc_now)

    def check_invariants(self) -> None:
        if self.role == ChatRole.USER and any(
            value is not None
            for value in (
                self.sources,
                self.model,
                self.input_tokens,
                self.output_tokens,
                self.latency_ms,
            )
        ):
            raise UnprocessableEntity(
                "A user message has no sources, model or usage: only answers do"
            )
