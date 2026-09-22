"""Fixtures: the core table on moto, an app client and three users.

Every test runs inside `mock_dynamodb()` (no AWS, no database server): the
table is created fresh with `ensure_table` and the app's `get_table`
dependency is pointed at it.
"""

from collections.abc import AsyncGenerator, AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from core_api.api.deps import get_table
from core_api.config import get_settings
from core_api.domain.models import User
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.main import app
from httpx import ASGITransport, AsyncClient
from travel_common.dynamodb import dynamodb_client
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token
from travel_common.testing import mock_dynamodb

settings = get_settings()
TEST_TABLE = "travel-ai-test-core"


class _Current:
    """The table of the running test, for helpers that are not fixtures."""

    table: DynamoTable | None = None


def current_table() -> DynamoTable:
    assert _Current.table is not None, "the `table` fixture is not active"
    return _Current.table


@pytest.fixture(autouse=True)
async def table() -> AsyncIterator[DynamoTable]:
    """A fresh core table on moto for every test, wired into the app."""
    with mock_dynamodb():
        handle = DynamoTable(dynamodb_client("", settings.AWS_REGION), TEST_TABLE)
        await handle.ensure()
        _Current.table = handle
        app.dependency_overrides[get_table] = lambda: handle
        try:
            yield handle
        finally:
            app.dependency_overrides.pop(get_table, None)
            _Current.table = None


@pytest.fixture
def users(table: DynamoTable) -> DynamoUserRepository:
    return DynamoUserRepository(table)


@pytest.fixture
async def client(table: DynamoTable) -> AsyncGenerator[AsyncClient, None]:
    """App client against the test table."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
    app.dependency_overrides[get_table] = lambda: table


# ── Trips ────────────────────────────────────────────────────────────────────

TRIP_CITY: dict[str, str] = {
    "city_slug": "budapest",
    "city": "Budapest",
    "country": "Hungary",
    "country_code": "HU",
}
"""The city every trip needs (ADR 0019): spread it into a create body."""


def day_offset(days: int) -> str:
    """A date `days` from today, as the API writes it.

    A trip's phase is derived from its dates (ADR 0019), so a test that means
    "still ahead" has to say it relative to today, not with a fixed year.
    """
    return (datetime.now(UTC).date() + timedelta(days=days)).isoformat()


def trip_body(**fields: object) -> dict[str, object]:
    """A minimal valid `TripCreate` body, plus whatever the test cares about."""
    return {"title": "t", **TRIP_CITY, **fields}


# ── Users and credentials ────────────────────────────────────────────────────


async def make_user(
    email: str, role: Role = Role.USER, *, is_active: bool = True
) -> User:
    """An account in the test table, created through the repository."""
    user = User(email=email, name=email.split("@")[0], is_active=is_active, role=role)
    return await DynamoUserRepository(current_table()).add(user)


def headers_for(user: User) -> dict[str, str]:
    principal = Principal(subject=str(user.id), email=user.email, role=user.role)
    return {"Authorization": f"Bearer {create_access_token(principal, settings)}"}


@pytest.fixture
async def alice(table: DynamoTable) -> User:
    return await make_user("alice@example.com")


@pytest.fixture
async def bob(table: DynamoTable) -> User:
    return await make_user("bob@example.com")


@pytest.fixture
async def admin(table: DynamoTable) -> User:
    return await make_user("admin@example.com", Role.ADMIN)
