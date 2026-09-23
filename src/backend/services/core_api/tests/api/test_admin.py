"""Admin reads (ADR 0024): every trip and account, for administrators only."""

import logging

import pytest
from core_api.domain.models import User
from httpx import AsyncClient

from tests.conftest import headers_for, trip_body

ADMIN_URL = "/api/v1/admin"
TRIPS_URL = "/api/v1/trips/"
MISSING = "00000000-0000-0000-0000-000000000000"
SESSION = "5b0c3f0e-8c6a-4d59-9a7e-2f4f1d7e9b10"


async def _create(client: AsyncClient, owner: User, **fields: object) -> dict:
    response = await client.post(
        TRIPS_URL, json=trip_body(**fields), headers=headers_for(owner)
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(
    "path",
    ["/trips", f"/trips/{MISSING}/{MISSING}", "/users"],
)
async def test_non_admins_are_forbidden(client: AsyncClient, alice: User, path: str):
    response = await client.get(f"{ADMIN_URL}{path}", headers=headers_for(alice))

    assert response.status_code == 403


async def test_admin_lists_every_trip_newest_first(
    client: AsyncClient, admin: User, alice: User, bob: User
):
    first = await _create(client, alice, title="Alice's", planner_session_id=SESSION)
    second = await _create(client, bob, title="Bob's")

    response = await client.get(f"{ADMIN_URL}/trips", headers=headers_for(admin))

    assert response.status_code == 200, response.text
    page = response.json()
    assert [item["id"] for item in page["items"]] == [second["id"], first["id"]]
    assert page["next_cursor"] is None
    newest, oldest = page["items"]
    assert newest["user_id"] == str(bob.id)
    assert newest["planner_session_id"] is None
    assert oldest["user_id"] == str(alice.id)
    assert oldest["planner_session_id"] == SESSION
    assert oldest["phase"] == "upcoming"
    assert set(oldest) == {
        "id",
        "user_id",
        "title",
        "city_slug",
        "city",
        "country_code",
        "start_date",
        "end_date",
        "image_url",
        "created_at",
        "updated_at",
        "planner_session_id",
        "phase",
    }


async def test_the_cursor_walks_every_trip(
    client: AsyncClient, admin: User, alice: User, bob: User
):
    created = [
        await _create(client, owner, title=title)
        for owner, title in ((alice, "a"), (bob, "b"), (alice, "c"))
    ]
    seen: list[str] = []
    cursor: str | None = None

    for _ in range(10):
        params: dict[str, str | int] = {"limit": 1}
        if cursor:
            params["cursor"] = cursor
        response = await client.get(
            f"{ADMIN_URL}/trips", params=params, headers=headers_for(admin)
        )
        assert response.status_code == 200, response.text
        page = response.json()
        assert len(page["items"]) <= 1
        seen.extend(item["title"] for item in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert seen == [trip["title"] for trip in reversed(created)]


async def test_a_bad_cursor_or_limit_is_refused(client: AsyncClient, admin: User):
    headers = headers_for(admin)

    garbage = await client.get(
        f"{ADMIN_URL}/trips", params={"cursor": "not-a-cursor"}, headers=headers
    )
    too_big = await client.get(
        f"{ADMIN_URL}/trips", params={"limit": 201}, headers=headers
    )

    assert garbage.status_code == 400
    assert too_big.status_code == 422


async def test_admin_opens_anyones_trip(client: AsyncClient, admin: User, bob: User):
    trip = await _create(client, bob, title="Bob's", planner_session_id=SESSION)

    found = await client.get(
        f"{ADMIN_URL}/trips/{bob.id}/{trip['id']}", headers=headers_for(admin)
    )
    unknown = await client.get(
        f"{ADMIN_URL}/trips/{bob.id}/{MISSING}", headers=headers_for(admin)
    )

    assert found.status_code == 200, found.text
    assert found.json()["title"] == "Bob's"
    assert found.json()["planner_session_id"] == SESSION
    assert "itinerary_days" in found.json()
    assert unknown.status_code == 404


async def test_admin_lists_accounts_with_their_subject(
    client: AsyncClient, admin: User, alice: User, bob: User
):
    response = await client.get(
        f"{ADMIN_URL}/users", params={"limit": 2}, headers=headers_for(admin)
    )

    assert response.status_code == 200, response.text
    page = response.json()
    assert [u["email"] for u in page["items"]] == [admin.email, alice.email]
    assert all("subject" in u for u in page["items"])
    assert page["next_cursor"] is not None

    rest = await client.get(
        f"{ADMIN_URL}/users",
        params={"limit": 2, "cursor": page["next_cursor"]},
        headers=headers_for(admin),
    )
    assert [u["email"] for u in rest.json()["items"]] == [bob.email]
    assert rest.json()["next_cursor"] is None


async def test_every_admin_read_is_audited(
    client: AsyncClient,
    admin: User,
    bob: User,
    caplog: pytest.LogCaptureFixture,
):
    trip = await _create(client, bob)
    caplog.set_level(logging.INFO, logger="core_api.api.v1.endpoints.admin")

    await client.get(f"{ADMIN_URL}/trips", headers=headers_for(admin))
    await client.get(
        f"{ADMIN_URL}/trips/{bob.id}/{trip['id']}", headers=headers_for(admin)
    )

    lines = [r.getMessage() for r in caplog.records if "admin_read" in r.getMessage()]
    assert lines == [
        f"admin_read subject={admin.id} route=/api/v1/admin/trips target=-",
        f"admin_read subject={admin.id} "
        f"route=/api/v1/admin/trips/{bob.id}/{trip['id']} target={trip['id']}",
    ]
