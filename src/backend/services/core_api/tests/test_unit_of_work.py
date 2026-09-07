"""One transaction per request: durable on success, gone on failure."""

from typing import Any

import pytest
from core_api.db.session import unit_of_work
from core_api.models.trip import Trip
from core_api.models.user import User
from httpx import AsyncClient
from sqlalchemy import func, select

from tests.conftest import AsyncSessionTest, headers_for

TRIPS_URL = "/api/v1/trips/"


class _FakeSession:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def commit(self) -> None:
        self.calls.append("commit")

    async def rollback(self) -> None:
        self.calls.append("rollback")


async def test_commits_when_the_request_succeeds():
    session: Any = _FakeSession()

    async with unit_of_work(session):
        pass

    assert session.calls == ["commit"]


async def test_rolls_back_and_reraises_on_error():
    session: Any = _FakeSession()

    with pytest.raises(RuntimeError, match="boom"):
        async with unit_of_work(session):
            raise RuntimeError("boom")

    assert session.calls == ["rollback"]


async def test_domain_error_rolls_back_the_request(client: AsyncClient, alice: User):
    """A rule violation after a mutation leaves nothing behind (see PATCH)."""
    headers = headers_for(alice)
    created = await client.post(
        TRIPS_URL,
        json={"title": "t", "start_date": "2026-05-01", "end_date": "2026-05-10"},
        headers=headers,
    )
    trip_id = created.json()["id"]

    rejected = await client.patch(
        f"{TRIPS_URL}{trip_id}", json={"end_date": "2026-04-30"}, headers=headers
    )
    assert rejected.status_code == 422

    async with AsyncSessionTest() as other:
        end_date = await other.scalar(select(Trip.end_date).where(Trip.id == trip_id))
    assert str(end_date) == "2026-05-10"


async def test_created_rows_are_visible_from_another_session(
    client: AsyncClient, alice: User
):
    """The repository only flushes; the request boundary is what commits."""
    created = await client.post(
        TRIPS_URL, json={"title": "durable"}, headers=headers_for(alice)
    )
    assert created.status_code == 201

    async with AsyncSessionTest() as other:
        count = await other.scalar(select(func.count()).select_from(Trip))

    assert count == 1
