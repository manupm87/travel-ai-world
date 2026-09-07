"""Trips are private: listing, reading and mutating stop at the owner boundary."""

from core_api.models.user import User
from httpx import AsyncClient
from travel_common.principal import Role

from tests.conftest import headers_for

TRIPS_URL = "/api/v1/trips/"
MISSING = "00000000-0000-0000-0000-000000000000"


async def test_create_and_list_only_own_trips(
    client: AsyncClient, alice: User, bob: User
):
    created = await client.post(
        TRIPS_URL, json={"title": "Lisboa"}, headers=headers_for(alice)
    )
    assert created.status_code == 201
    assert created.json()["user_id"] == alice.id

    alice_trips = await client.get(TRIPS_URL, headers=headers_for(alice))
    bob_trips = await client.get(TRIPS_URL, headers=headers_for(bob))

    assert [t["title"] for t in alice_trips.json()] == ["Lisboa"]
    assert bob_trips.json() == []


async def test_list_is_paginated(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    for title in ("a", "b", "c"):
        await client.post(TRIPS_URL, json={"title": title}, headers=headers)

    page = await client.get(TRIPS_URL, params={"skip": 1, "limit": 1}, headers=headers)
    assert [t["title"] for t in page.json()] == ["b"]

    too_big = await client.get(TRIPS_URL, params={"limit": 501}, headers=headers)
    assert too_big.status_code == 422


async def test_other_users_trip_is_forbidden(
    client: AsyncClient, alice: User, bob: User
):
    created = await client.post(
        TRIPS_URL, json={"title": "Oporto"}, headers=headers_for(alice)
    )
    trip_id = created.json()["id"]

    response = await client.get(f"{TRIPS_URL}{trip_id}", headers=headers_for(bob))

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "FORBIDDEN"


async def test_missing_trip_is_not_found(client: AsyncClient, alice: User):
    response = await client.get(f"{TRIPS_URL}{MISSING}", headers=headers_for(alice))

    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "Trip not found"


async def test_update_and_delete_own_trip(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    created = await client.post(
        TRIPS_URL, json={"title": "Roma", "description": "keep me"}, headers=headers
    )
    trip_id = created.json()["id"]

    updated = await client.patch(
        f"{TRIPS_URL}{trip_id}", json={"title": "Roma 2026"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Roma 2026"
    assert updated.json()["description"] == "keep me", "PATCH is partial"

    deleted = await client.delete(f"{TRIPS_URL}{trip_id}", headers=headers)
    assert deleted.status_code == 204
    assert (
        await client.get(f"{TRIPS_URL}{trip_id}", headers=headers)
    ).status_code == 404


async def test_unknown_user_in_valid_token_is_unauthorized(client: AsyncClient):
    ghost = User(id=999_999, email="ghost@example.com", role=Role.USER)

    response = await client.get(TRIPS_URL, headers=headers_for(ghost))

    assert response.status_code == 401
