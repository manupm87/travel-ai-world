"""`copy-from-postgres`: RDS into the core table, once (ADR 0023, TRA-218).

Needs PostgreSQL, like the suite did before DynamoDB: the legacy schema is
built with `Base.metadata.create_all` in `<DB_NAME>_copytest`, filled with
every shape the copy has to carry, and copied twice into the moto table.
Skipped, with the reason, when PostgreSQL cannot be reached.
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from core_api import ops
from core_api.config import get_settings
from core_api.domain import models as domain
from core_api.infrastructure.dynamo.repositories import (
    DynamoChatMessageRepository,
    DynamoChatThreadRepository,
    DynamoTripRepository,
    DynamoUserRepository,
)
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.legacy_sql import models as legacy
from core_api.pagination import Page
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from travel_common.principal import Role

from tests.conftest import make_user

settings = get_settings()
COPY_DB = f"{settings.DB_NAME}_copytest"
SERVER = (
    f"postgresql+asyncpg://{settings.DB_USER}:{settings.DB_PASSWORD}"
    f"@{settings.DB_SERVER}:{settings.DB_PORT}"
)

T0 = datetime(2026, 5, 1, 9, 0, tzinfo=UTC)
CARD: dict[str, Any] = {"id": "osm:relation/13067", "score": 0.5, "note": None}


@pytest.fixture
async def legacy_engine() -> AsyncIterator[AsyncEngine]:
    admin = create_async_engine(
        f"{SERVER}/postgres", isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    try:
        async with admin.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": COPY_DB},
            )
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{COPY_DB}"'))
    except Exception as exc:  # any failure to reach the server means "no PostgreSQL"
        pytest.skip(
            f"PostgreSQL unreachable at {settings.DB_SERVER}:{settings.DB_PORT} "
            f"({type(exc).__name__}): the copy test needs it"
        )
    finally:
        await admin.dispose()

    engine = create_async_engine(f"{SERVER}/{COPY_DB}", poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.run_sync(legacy.Base.metadata.drop_all)
        await conn.run_sync(legacy.Base.metadata.create_all)
    try:
        yield engine
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(legacy.Base.metadata.drop_all)
        await engine.dispose()


async def seed(engine: AsyncEngine) -> None:
    """Two accounts, a full trip, a bare trip, a thread with three turns."""
    ada_trip, bob_trip = uuid.uuid4(), uuid.uuid4()
    day_id, thread_id = uuid.uuid4(), uuid.uuid4()
    async with AsyncSession(engine) as session:
        session.add_all(
            [
                legacy.User(
                    id=1,
                    email="ada@example.com",
                    role=Role.ADMIN,
                    auth_provider="cognito",
                    google_id="sub-ada",
                    name="Ada",
                    picture="https://example.test/ada.png",
                ),
                legacy.User(id=2, email="bob@example.com", name="Bob"),
            ]
        )
        await session.flush()
        session.add_all(
            [
                legacy.Trip(
                    id=ada_trip,
                    user_id=1,
                    title="Budapest in May",
                    city_slug="budapest",
                    city="Budapest",
                    country="Hungary",
                    country_code="HU",
                    lat=47.4979,
                    lng=19.0402,
                    origin="Madrid",
                    start_date=date(2027, 5, 1),
                    end_date=date(2027, 5, 4),
                    duration_days=4,
                    travelers_adults=2,
                    travel_style=["culture", "food"],
                    budget_tier=2,
                    budget_total=Decimal("1500.00"),
                    budget_currency="EUR",
                    ai_local_tips=["Carry cash"],
                    created_at=T0,
                    updated_at=T0 + timedelta(hours=1),
                ),
                legacy.Trip(
                    id=bob_trip,
                    user_id=2,
                    title="Bologna",
                    city_slug="bologna",
                    city="Bologna",
                    country="Italy",
                    country_code="IT",
                    created_at=T0,
                    updated_at=T0,
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                legacy.ItineraryDay(
                    id=day_id,
                    trip_id=ada_trip,
                    day_number=1,
                    date=date(2027, 5, 1),
                    estimated_cost=Decimal("80.00"),
                    created_at=T0,
                    updated_at=T0,
                ),
                legacy.Accommodation(
                    trip_id=ada_trip,
                    name="Hotel Gellért",
                    check_in=date(2027, 5, 1),
                    check_out=date(2027, 5, 4),
                    amenities=["spa", "wifi"],
                    price_per_night=Decimal("120.50"),
                    rating=4.5,
                    source_ref="osm:way/1",
                    card=CARD,
                    created_at=T0,
                    updated_at=T0,
                ),
                legacy.Transportation(
                    trip_id=ada_trip,
                    type="flight",
                    category="outbound",
                    departure_time=T0,
                    arrival_time=T0 + timedelta(hours=3),
                    cost=Decimal("99.99"),
                    created_at=T0,
                    updated_at=T0,
                ),
                legacy.ChatThread(
                    id=thread_id,
                    user_id=1,
                    title="Budapest",
                    city="budapest",
                    created_at=T0,
                    updated_at=T0 + timedelta(minutes=2),
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                legacy.Activity(
                    itinerary_day_id=day_id,
                    title="Széchenyi Baths",
                    part_of_day="afternoon",
                    source_ref="osm:relation/13067",
                    card=CARD,
                    location_lat=47.5186,
                    cost=Decimal("30.00"),
                    booking_required=True,
                    created_at=T0,
                    updated_at=T0,
                ),
                legacy.Meal(
                    itinerary_day_id=day_id,
                    restaurant_name="Kádár",
                    type="lunch",
                    estimated_cost=Decimal("15.00"),
                    created_at=T0,
                    updated_at=T0,
                ),
                legacy.ChatMessage(
                    thread_id=thread_id,
                    role="user",
                    content="Where to swim?",
                    created_at=T0,
                ),
                legacy.ChatMessage(
                    thread_id=thread_id,
                    role="assistant",
                    content="Széchenyi.",
                    sources=[{"doc_id": "osm:relation/13067", "score": 0.2}],
                    model="m",
                    input_tokens=10,
                    output_tokens=3,
                    latency_ms=900,
                    created_at=T0 + timedelta(microseconds=1),
                ),
                legacy.ChatMessage(
                    thread_id=thread_id,
                    role="user",
                    content="Thanks",
                    created_at=T0 + timedelta(minutes=2),
                ),
            ]
        )
        await session.commit()


def assert_same_fields(copied: Any, row: Any, *, skip: tuple[str, ...] = ()) -> None:
    """Every column the entity also has, compared one by one."""
    for column in row.__table__.columns:
        name = column.key
        if name in skip or name not in type(copied).__dataclass_fields__:
            continue
        assert getattr(copied, name) == getattr(row, name), name


async def test_the_copy_carries_everything_and_can_run_again(
    legacy_engine: AsyncEngine, table: DynamoTable
):
    await seed(legacy_engine)
    bob_on_dynamo = await make_user("bob@example.com")  # signed in before the copy

    first = await ops.copy_postgres_into(legacy_engine, table)
    items_after_first = table.client.scan(TableName=table.name)["Count"]
    second = await ops.copy_postgres_into(legacy_engine, table)

    expected = {"users": 2, "trips": 2, "threads": 1, "messages": 3}
    assert first == second == expected
    assert table.client.scan(TableName=table.name)["Count"] == items_after_first, (
        "a second run overwrites, it does not duplicate"
    )

    users = DynamoUserRepository(table)
    ada = await users.get_by_email("ada@example.com")
    bob = await users.get_by_email("bob@example.com")
    assert ada is not None and bob is not None
    assert (
        ada.id
        == ops.legacy_user_id(1)
        == uuid.uuid5(uuid.NAMESPACE_URL, "kyrian-world:user:1")
    )
    assert bob.id == bob_on_dynamo.id, "an account already on DynamoDB keeps its id"
    assert (ada.role, ada.google_id, ada.auth_provider, ada.version) == (
        Role.ADMIN,
        "sub-ada",
        "cognito",
        ops.COPIED_VERSION,
    )

    async with AsyncSession(legacy_engine) as session:
        rows = {t.title: t for t in await session.scalars(select(legacy.Trip))}
        thread_row = (await session.scalars(select(legacy.ChatThread))).one()
        message_rows = list(
            await session.scalars(
                select(legacy.ChatMessage).order_by(legacy.ChatMessage.created_at)
            )
        )

    trips = DynamoTripRepository(table)
    copied = await trips.get(ada.id, rows["Budapest in May"].id)
    assert copied is not None
    row = rows["Budapest in May"]
    assert_same_fields(copied, row, skip=("user_id",))
    assert copied.user_id == ada.id
    assert copied.version == ops.COPIED_VERSION
    assert_same_fields(copied.itinerary_days[0], row.itinerary_days[0])
    assert_same_fields(
        copied.itinerary_days[0].activities[0], row.itinerary_days[0].activities[0]
    )
    assert copied.itinerary_days[0].activities[0].card == CARD
    assert_same_fields(
        copied.itinerary_days[0].meals[0], row.itinerary_days[0].meals[0]
    )
    assert_same_fields(copied.accommodations[0], row.accommodations[0])
    assert_same_fields(copied.transportations[0], row.transportations[0])
    assert [t.title for t in await trips.list_for(bob.id)] == ["Bologna"]

    threads = await DynamoChatThreadRepository(table).list_for(ada.id)
    assert len(threads) == 1
    assert_same_fields(threads[0], thread_row, skip=("user_id",))

    copied_messages = await DynamoChatMessageRepository(table).list_in(
        threads[0].id, Page()
    )
    assert [m.content for m in copied_messages] == [
        "Where to swim?",
        "Széchenyi.",
        "Thanks",
    ], "the order of the conversation is kept"
    for message, message_row in zip(copied_messages, message_rows, strict=True):
        assert_same_fields(message, message_row)


async def test_a_count_mismatch_fails_the_copy(
    legacy_engine: AsyncEngine, table: DynamoTable, monkeypatch: pytest.MonkeyPatch
):
    await seed(legacy_engine)

    async def lose_one(self: Any, items: list[Any]) -> int:
        return max(len(items) - 1, 0)

    monkeypatch.setattr(ops.DynamoCopyTarget, "put_all", lose_one)

    with pytest.raises(ops.CopyIncomplete):
        await ops.copy_postgres_into(legacy_engine, table)


def test_the_copy_builds_plain_entities():
    """The row → entity mapping needs no database: fields are taken by name."""
    row = legacy.ChatThread(
        id=uuid.uuid4(), user_id=7, title="t", city=None, created_at=T0, updated_at=T0
    )
    thread = ops._thread(row, ops.legacy_user_id(7))

    assert isinstance(thread, domain.ChatThread)
    assert thread.user_id == ops.legacy_user_id(7)
    assert (thread.title, thread.created_at, thread.version) == ("t", T0, 1)
