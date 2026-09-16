"""`seed_demo_trips` loads the four packaged trips for one account, idempotently."""

from core_api.models.accommodation import Accommodation
from core_api.models.activity import Activity
from core_api.models.destination import Destination
from core_api.models.itinerary_day import ItineraryDay
from core_api.models.meal import Meal
from core_api.models.transportation import Transportation
from core_api.models.trip import Trip
from core_api.models.user import User
from core_api.seed import load_demo_trips, seed_demo_trips
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from travel_common.principal import Role

from tests.conftest import AsyncSessionTest, headers_for, make_user

TRIPS_URL = "/api/v1/trips/"
OWNER = "demo@example.com"
JAPAN = "Japan Explorer: Traditions & Neon"


async def _count(db: AsyncSession, model: type) -> int:
    return await db.scalar(select(func.count()).select_from(model)) or 0


async def _owner_trips(db: AsyncSession, owner_id: int) -> list[Trip]:
    rows = await db.execute(select(Trip).where(Trip.user_id == owner_id))
    return list(rows.scalars().all())


def test_the_package_ships_four_valid_demo_trips():
    demo = load_demo_trips()

    assert [d.source for d in demo] == [
        "grand-european-tour.json",
        "japan.json",
        "new-york.json",
        "prague-vienna-budapest.json",
    ]
    assert JAPAN in {d.title for d in demo}
    for trip in demo:
        known = {fixture_id for fixture_id, _ in trip.destinations}
        assert all(
            day.destination_ref is None or day.destination_ref in known
            for day in trip.days
        ), f"{trip.source}: a day references a destination the file does not define"


async def test_seed_creates_the_owner_and_four_trips_with_every_child(
    db_session: AsyncSession,
):
    demo = load_demo_trips()

    report = await seed_demo_trips(AsyncSessionTest, OWNER)

    owner = await db_session.scalar(select(User).where(User.email == OWNER))
    assert owner is not None
    assert (owner.name, owner.is_active, owner.role, owner.auth_provider) == (
        "demo",
        True,
        Role.USER,
        "google",
    )
    assert report.owner_id == owner.id
    assert report.created == [d.title for d in demo]
    assert report.replaced == []

    assert await _count(db_session, Trip) == 4
    assert await _count(db_session, Destination) == sum(
        len(d.destinations) for d in demo
    )
    assert await _count(db_session, Accommodation) == sum(
        len(d.accommodations) for d in demo
    )
    assert await _count(db_session, Transportation) == sum(
        len(d.transportations) for d in demo
    )
    assert await _count(db_session, ItineraryDay) == sum(len(d.days) for d in demo)
    assert await _count(db_session, Activity) == sum(
        len(day.activities) for d in demo for day in d.days
    )
    assert await _count(db_session, Meal) == sum(
        len(day.meals) for d in demo for day in d.days
    )


async def test_seeding_twice_replaces_the_four_and_keeps_other_trips(
    db_session: AsyncSession,
):
    owner = await make_user(db_session, OWNER)
    db_session.add(Trip(user_id=owner.id, title="My own trip"))
    await db_session.commit()

    first = await seed_demo_trips(AsyncSessionTest, OWNER)
    second = await seed_demo_trips(AsyncSessionTest, OWNER)

    assert first.owner_id == second.owner_id == owner.id, "existing account reused"
    assert len(first.created) == 4 and first.replaced == []
    assert len(second.replaced) == 4 and second.created == []

    trips = await _owner_trips(db_session, owner.id)
    assert len(trips) == 5
    assert sorted(t.title for t in trips) == sorted([*second.replaced, "My own trip"])
    # Replaced means recreated: the child rows are exactly one set, not two.
    demo = load_demo_trips()
    assert await _count(db_session, Destination) == sum(
        len(d.destinations) for d in demo
    )
    assert await _count(db_session, Activity) == sum(
        len(day.activities) for d in demo for day in d.days
    )


async def test_the_owner_reads_the_demo_trips_through_the_api(
    client: AsyncClient, db_session: AsyncSession
):
    await seed_demo_trips(AsyncSessionTest, OWNER)
    owner = await db_session.scalar(select(User).where(User.email == OWNER))
    assert owner is not None
    headers = headers_for(owner)

    listed = await client.get(TRIPS_URL, headers=headers)
    assert listed.status_code == 200
    assert sorted(t["title"] for t in listed.json()) == sorted(
        d.title for d in load_demo_trips()
    )

    japan_id = next(t["id"] for t in listed.json() if t["title"] == JAPAN)
    japan = (await client.get(f"{TRIPS_URL}{japan_id}", headers=headers)).json()

    destination_ids = {d["id"] for d in japan["destinations"]}
    assert len(destination_ids) == 3
    assert japan["itinerary_days"], "the Japan trip has days"
    assert all(
        day["destination_id"] in destination_ids for day in japan["itinerary_days"]
    )
    assert all(day["trip_id"] == japan_id for day in japan["itinerary_days"])
    assert japan["itinerary_days"][0]["activities"], "activities travel with their day"
