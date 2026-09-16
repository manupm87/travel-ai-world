"""Demo trips, loaded for one account through the ordinary services.

`data/*.json` holds the four demo trips in the shape of `TripResponse` (they
were the frontend fixtures, ADR 0011). The fixture ids (`trip_japan_2026`,
`dest_tokyo`, `trip_japan_2026_day_1`, ...) only cross-reference rows inside a
file; the database generates the real UUIDs and this module remaps
`itinerary_days[].destination_id` and the day of every activity and meal.

Every row goes through `TripService` / `BaseService.create`, so the schemas
and `check_invariants()` apply exactly as they do for a request. The run is
one unit of work: either the owner ends up with the four trips or nothing
changed.

A demo trip is identified by `(owner, title)`. Re-running replaces the
owner's trip with that title (the cascade removes its children) and leaves
the owner's other trips alone, so the command is idempotent.

Three entry points share this implementation: `just seed <email>`,
`entrypoint.sh seed <email>` in the container, and
`{"command": "seed", "args": {"email": ...}}` on the Lambda's `/events`
(`core_api.ops`).
"""

import json
import logging
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field
from importlib import resources
from typing import Any

from travel_common.principal import Role

from core_api.db.session import SessionFactory, unit_of_work
from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.destination import Destination
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.user import User
from core_api.pagination import Page
from core_api.repositories.base import BaseRepository
from core_api.repositories.trip_repository import TripRepository
from core_api.repositories.user_repository import UserRepository
from core_api.schemas.accommodation import AccommodationCreate
from core_api.schemas.activity import ActivityCreate
from core_api.schemas.destination import DestinationCreate
from core_api.schemas.itinerary_day import ItineraryDayCreate
from core_api.schemas.meal import MealCreate
from core_api.schemas.transportation import TransportationCreate
from core_api.schemas.trip import TripCreate
from core_api.services.base import BaseService
from core_api.services.trip_service import TripService

logger = logging.getLogger(__name__)

RESPONSE_ONLY_KEYS = frozenset(
    {"id", "user_id", "trip_id", "itinerary_day_id", "created_at", "updated_at"}
)
"""Keys the API generates; the JSON carries them only because it is
`TripResponse`-shaped."""


# ── The data, parsed once through the Create schemas ─────────────────────────


@dataclass(frozen=True, slots=True)
class DemoDay:
    fixture_id: str
    destination_ref: str | None
    day: ItineraryDayCreate
    activities: list[ActivityCreate]
    meals: list[MealCreate]


@dataclass(frozen=True, slots=True)
class DemoTrip:
    source: str
    trip: TripCreate
    destinations: list[tuple[str, DestinationCreate]]
    accommodations: list[AccommodationCreate]
    transportations: list[TransportationCreate]
    days: list[DemoDay]

    @property
    def title(self) -> str:
        return self.trip.title


def _writable(raw: dict[str, Any], *drop: str) -> dict[str, Any]:
    return {
        k: v for k, v in raw.items() if k not in RESPONSE_ONLY_KEYS and k not in drop
    }


def parse_demo_trip(source: str, raw: dict[str, Any]) -> DemoTrip:
    """Validate one JSON document exactly as the API would validate a request."""
    trip = TripCreate.model_validate(
        _writable(
            raw, "destinations", "itinerary_days", "accommodations", "transportations"
        )
    )
    destinations = [
        (d["id"], DestinationCreate.model_validate(_writable(d)))
        for d in raw["destinations"]
    ]
    days = [
        DemoDay(
            fixture_id=d["id"],
            destination_ref=d.get("destination_id"),
            # The reference is a fixture id, not a UUID: remapped on insert.
            day=ItineraryDayCreate.model_validate(
                _writable(d, "destination_id", "activities", "meals")
            ),
            activities=[
                ActivityCreate.model_validate(_writable(a)) for a in d["activities"]
            ],
            meals=[MealCreate.model_validate(_writable(m)) for m in d["meals"]],
        )
        for d in raw["itinerary_days"]
    ]
    return DemoTrip(
        source=source,
        trip=trip,
        destinations=destinations,
        accommodations=[
            AccommodationCreate.model_validate(_writable(a))
            for a in raw["accommodations"]
        ],
        transportations=[
            TransportationCreate.model_validate(_writable(t))
            for t in raw["transportations"]
        ],
        days=days,
    )


def _documents() -> Iterator[tuple[str, dict[str, Any]]]:
    data = resources.files(__package__) / "data"
    for entry in sorted(data.iterdir(), key=lambda e: e.name):
        if entry.name.endswith(".json"):
            yield entry.name, json.loads(entry.read_text(encoding="utf-8"))


def load_demo_trips() -> list[DemoTrip]:
    """The packaged demo trips, in file-name order. Fails loudly on bad data."""
    return [parse_demo_trip(name, raw) for name, raw in _documents()]


# ── The command ──────────────────────────────────────────────────────────────


@dataclass(slots=True)
class SeedReport:
    owner_id: int
    created: list[str] = field(default_factory=list)
    replaced: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.created) + len(self.replaced)

    def summary(self) -> str:
        return (
            f"owner id={self.owner_id}: {self.total} demo trips "
            f"({len(self.created)} created, {len(self.replaced)} replaced)"
        )

    def __str__(self) -> str:
        return self.summary()


async def seed_demo_trips(
    session_factory: SessionFactory, owner_email: str
) -> SeedReport:
    """Load the demo trips for `owner_email`, creating the account if needed.

    The account row is created as an active `USER` signed in through Google,
    with the email's local part as its name. Both sign-in modes match
    accounts by email (`UserService.upsert_from_identity` in Cognito mode,
    the Google sign-in use case locally), so the row is adopted, profile
    refreshed, the first time that person really signs in.
    """
    demo_trips = load_demo_trips()
    async with session_factory() as session, unit_of_work(session) as db:
        users = UserRepository(db)
        owner = await users.get_by_email(owner_email)
        if owner is None:
            owner = await users.create(
                User(
                    email=owner_email,
                    name=owner_email.split("@", 1)[0],
                    is_active=True,
                    role=Role.USER,
                    auth_provider="google",
                )
            )
            logger.info("Seed: created account %s (id=%s)", owner_email, owner.id)
        else:
            logger.info("Seed: account %s exists (id=%s)", owner_email, owner.id)

        report = SeedReport(owner_id=owner.id)
        trips = TripService(TripRepository(db))
        for demo in demo_trips:
            existing = await trips.list(Page(), user_id=owner.id, title=demo.title)
            for trip in existing:
                await trips.delete(trip)
            await _insert(db, demo, owner.id)
            if existing:
                report.replaced.append(demo.title)
                logger.info("Seed: replaced %r (%s)", demo.title, demo.source)
            else:
                report.created.append(demo.title)
                logger.info("Seed: created %r (%s)", demo.title, demo.source)

    logger.info("Seed: %s", report.summary())
    return report


async def _insert(db: Any, demo: DemoTrip, owner_id: int) -> None:
    trips = TripService(TripRepository(db))
    trip = await trips.create(demo.trip, user_id=owner_id)

    destination_ids: dict[str, uuid.UUID] = {}
    destinations: BaseService[Destination, DestinationCreate, Any] = BaseService(
        BaseRepository(db, Destination)
    )
    for fixture_id, destination_in in demo.destinations:
        destination = await destinations.create(destination_in, trip_id=trip.id)
        destination_ids[fixture_id] = destination.id

    accommodations: BaseService[Accommodation, AccommodationCreate, Any] = BaseService(
        BaseRepository(db, Accommodation)
    )
    for accommodation_in in demo.accommodations:
        await accommodations.create(accommodation_in, trip_id=trip.id)

    transportations: BaseService[Transportation, TransportationCreate, Any] = (
        BaseService(BaseRepository(db, Transportation))
    )
    for transportation_in in demo.transportations:
        await transportations.create(transportation_in, trip_id=trip.id)

    days: BaseService[ItineraryDay, ItineraryDayCreate, Any] = BaseService(
        BaseRepository(db, ItineraryDay)
    )
    activities: BaseService[Activity, ActivityCreate, Any] = BaseService(
        BaseRepository(db, Activity)
    )
    meals: BaseService[Meal, MealCreate, Any] = BaseService(BaseRepository(db, Meal))
    for demo_day in demo.days:
        destination_id = (
            destination_ids[demo_day.destination_ref]
            if demo_day.destination_ref is not None
            else None
        )
        day_in = demo_day.day.model_copy(update={"destination_id": destination_id})
        day = await days.create(day_in, trip_id=trip.id)
        for activity_in in demo_day.activities:
            await activities.create(activity_in, itinerary_day_id=day.id)
        for meal_in in demo_day.meals:
            await meals.create(meal_in, itinerary_day_id=day.id)
