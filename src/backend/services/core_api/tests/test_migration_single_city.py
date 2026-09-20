"""The data step of the single-city migration, on a database that holds data.

`tests/conftest.py` builds the schema with `Base.metadata.create_all`, so it
never runs a migration and cannot see what one does to existing rows. This
test does the opposite: its own database, migrated to the revision before
9d3400b9db7a, filled with the three shapes of trip that were possible then,
and then migrated to head.

It is the only place that proves the promise of ADR 0019's migration —
demo trips and multi-city trips go, a single-city trip keeps its city, and
every planned row learns which part of the day it sits in.
"""

import asyncio
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from core_api.config import get_settings
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from tests.conftest import settings

BEFORE = "d1233b71daef"
"""The revision this migration follows: the last multi-city schema."""

ALEMBIC_DIR = Path(__file__).resolve().parents[1] / "alembic"
MIGRATION_DB = f"{settings.DB_NAME}_migration_test"
SERVER = (
    f"postgresql+asyncpg://{settings.DB_USER}:{settings.DB_PASSWORD}"
    f"@{settings.DB_SERVER}:{settings.DB_PORT}"
)

DEMO_TITLE = "Japan Explorer: Traditions & Neon"


def _upgrade(revision: str) -> None:
    """`alembic upgrade <revision>`, exactly as `core_api.ops` runs it.

    `env.py` opens its own event loop, so this belongs in a worker thread;
    it reads the database from the settings, which the fixture has already
    pointed at the throwaway database.
    """
    config = Config()
    config.set_main_option("script_location", str(ALEMBIC_DIR))
    command.upgrade(config, revision)


async def _sql(engine: AsyncEngine, statement: str, **params: object):
    """Run one statement and return its rows as tuples (empty for a write)."""
    async with engine.begin() as conn:
        result = await conn.execute(text(statement), params)
        return [tuple(row) for row in result] if result.returns_rows else []


@pytest.fixture
async def migrated(monkeypatch: pytest.MonkeyPatch):
    """A database at the revision before this one, with rows to migrate.

    Yields its engine; the test upgrades to head itself, so a failure leaves
    the database behind exactly as the migration left it.
    """
    admin = create_async_engine(
        f"{SERVER}/postgres", isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    async with admin.begin() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{MIGRATION_DB}"'))
        await conn.execute(text(f'CREATE DATABASE "{MIGRATION_DB}"'))

    monkeypatch.setenv("DB_NAME", MIGRATION_DB)
    get_settings.cache_clear()
    engine = create_async_engine(f"{SERVER}/{MIGRATION_DB}", poolclass=NullPool)
    try:
        await asyncio.to_thread(_upgrade, BEFORE)
        await _seed_old_world(engine)
        yield engine
    finally:
        await engine.dispose()
        get_settings.cache_clear()
        async with admin.begin() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{MIGRATION_DB}"'))
        await admin.dispose()


async def _seed_old_world(engine: AsyncEngine) -> None:
    """One user and four trips: a demo one, a multi-city one, one with no
    destination at all, and the only one that survives."""
    ids = {name: uuid.uuid4() for name in ("demo", "multi", "orphan", "keeper")}
    async with engine.begin() as conn:
        user_id = await conn.scalar(
            text(
                """
                INSERT INTO users (email, name, is_active, role, auth_provider)
                VALUES ('old@example.com', 'old', true, 'USER', 'google')
                RETURNING id
                """
            )
        )
        for name, title in (
            ("demo", DEMO_TITLE),
            ("multi", "Two cities"),
            ("orphan", "Nowhere in particular"),
            ("keeper", "A weekend away"),
        ):
            await conn.execute(
                text(
                    """
                    INSERT INTO trips (
                        id, user_id, title, status,
                        travelers_adults, travelers_children, travelers_infants
                    )
                    VALUES (:id, :user_id, :title, 'PLANNING', 1, 0, 0)
                    """
                ),
                {"id": ids[name], "user_id": user_id, "title": title},
            )
        for name, city, country, code in (
            ("demo", "Tokyo", "Japan", "JP"),
            ("multi", "Prague", "Czechia", "CZ"),
            ("multi", "Vienna", "Austria", "AT"),
            ("keeper", "New York", "United States", "US"),
        ):
            await conn.execute(
                text(
                    """
                    INSERT INTO destinations (
                        id, trip_id, city, country, country_code, lat, lng
                    )
                    VALUES (:id, :trip_id, :city, :country, :code, 40.7, -74.0)
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "trip_id": ids[name],
                    "city": city,
                    "country": country,
                    "code": code,
                },
            )

        day_id = uuid.uuid4()
        await conn.execute(
            text(
                """
                INSERT INTO itinerary_days (id, trip_id, day_number)
                VALUES (:id, :trip_id, 1)
                """
            ),
            {"id": day_id, "trip_id": ids["keeper"]},
        )
        for time in ("09:30", "13:00", "19:00", "22:15", None):
            await conn.execute(
                text(
                    """
                    INSERT INTO activities (
                        id, itinerary_day_id, title, "time", booking_required
                    )
                    VALUES (:id, :day_id, :title, :time, false)
                    """
                ),
                {
                    "id": uuid.uuid4(),
                    "day_id": day_id,
                    "title": f"at {time}",
                    "time": time,
                },
            )
        await conn.execute(
            text(
                """
                INSERT INTO meals (id, itinerary_day_id, restaurant_name, "time")
                VALUES (:id, :day_id, 'Katz', '13:30')
                """
            ),
            {"id": uuid.uuid4(), "day_id": day_id},
        )


async def test_only_single_city_trips_survive(migrated: AsyncEngine):
    await asyncio.to_thread(_upgrade, "head")

    rows = await _sql(
        migrated,
        "SELECT title, city, country, country_code, city_slug, lat, lng FROM trips",
    )

    assert rows == [
        ("A weekend away", "New York", "United States", "US", "new-york", 40.7, -74.0)
    ], "the demo trip, the multi-city one and the one with no city are gone"


async def test_the_parts_of_the_day_are_derived_from_the_times(migrated: AsyncEngine):
    await asyncio.to_thread(_upgrade, "head")

    activities = await _sql(
        migrated, 'SELECT "time", part_of_day FROM activities ORDER BY title'
    )
    meals = await _sql(migrated, 'SELECT "time", part_of_day FROM meals')

    assert activities == [
        ("09:30", "morning"),
        ("13:00", "afternoon"),
        ("19:00", "evening"),
        ("22:15", "night"),
        (None, None),
    ]
    assert meals == [("13:30", "afternoon")]


async def test_the_multi_city_structure_is_gone(migrated: AsyncEngine):
    await asyncio.to_thread(_upgrade, "head")

    left = await _sql(
        migrated,
        """
        SELECT to_regclass('destinations') IS NOT NULL,
               EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tripstatus'),
               EXISTS (
                   SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'itinerary_days'
                     AND column_name = 'destination_id'
               )
        """,
    )

    assert left == [(False, False, False)]


async def test_it_runs_on_an_empty_database(migrated: AsyncEngine):
    """Production is not the only place this runs: a fresh database gets the
    same migration, and a data step that assumed rows would break it."""
    await _sql(migrated, "DELETE FROM users")

    await asyncio.to_thread(_upgrade, "head")

    assert await _sql(migrated, "SELECT count(*) FROM trips") == [(0,)]
