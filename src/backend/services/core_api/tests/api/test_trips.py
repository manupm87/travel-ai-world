"""Trips are private: listing, reading and mutating stop at the owner boundary."""

import uuid

from core_api.domain.models import User
from httpx import AsyncClient
from travel_common.principal import Role

from tests.conftest import headers_for, trip_body

TRIPS_URL = "/api/v1/trips/"
MISSING = "00000000-0000-0000-0000-000000000000"


async def test_create_and_list_only_own_trips(
    client: AsyncClient, alice: User, bob: User
):
    created = await client.post(
        TRIPS_URL, json=trip_body(title="Lisboa"), headers=headers_for(alice)
    )
    assert created.status_code == 201
    assert created.json()["user_id"] == str(alice.id)

    alice_trips = await client.get(TRIPS_URL, headers=headers_for(alice))
    bob_trips = await client.get(TRIPS_URL, headers=headers_for(bob))

    assert [t["title"] for t in alice_trips.json()] == ["Lisboa"]
    assert bob_trips.json() == []


async def test_list_is_paginated(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    for title in ("a", "b", "c"):
        await client.post(TRIPS_URL, json=trip_body(title=title), headers=headers)

    page = await client.get(TRIPS_URL, params={"skip": 1, "limit": 1}, headers=headers)
    assert [t["title"] for t in page.json()] == ["b"]

    too_big = await client.get(TRIPS_URL, params={"limit": 501}, headers=headers)
    assert too_big.status_code == 422


async def test_other_users_trip_is_not_found(
    client: AsyncClient, alice: User, bob: User
):
    created = await client.post(
        TRIPS_URL, json=trip_body(title="Oporto"), headers=headers_for(alice)
    )
    trip_id = created.json()["id"]

    response = await client.get(f"{TRIPS_URL}{trip_id}", headers=headers_for(bob))

    # The trip is keyed by its owner (ADR 0023): for anyone else it is not there.
    assert response.status_code == 404
    assert response.json()["detail"]["error_code"] == "NOT_FOUND"


async def test_missing_trip_is_not_found(client: AsyncClient, alice: User):
    response = await client.get(f"{TRIPS_URL}{MISSING}", headers=headers_for(alice))

    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "Trip not found"


async def test_update_and_delete_own_trip(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    created = await client.post(
        TRIPS_URL, json=trip_body(title="Roma", description="keep me"), headers=headers
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


async def test_a_trip_carries_its_city(client: AsyncClient, alice: User):
    """One trip, one city (ADR 0019): the slug is what reopens it in the planner."""
    created = await client.post(
        TRIPS_URL,
        json=trip_body(title="Budapest", lat=47.4979, lng=19.0402, origin="Madrid"),
        headers=headers_for(alice),
    )

    assert created.status_code == 201, created.text
    trip = created.json()
    assert trip["city_slug"] == "budapest"
    assert (trip["city"], trip["country"], trip["country_code"]) == (
        "Budapest",
        "Hungary",
        "HU",
    )
    assert (trip["lat"], trip["lng"], trip["origin"]) == (47.4979, 19.0402, "Madrid")
    assert "destinations" not in trip


async def test_a_trip_without_a_city_is_rejected(client: AsyncClient, alice: User):
    response = await client.post(
        TRIPS_URL, json={"title": "Nowhere"}, headers=headers_for(alice)
    )

    assert response.status_code == 422


async def test_unknown_user_in_valid_token_is_unauthorized(client: AsyncClient):
    ghost = User(id=uuid.uuid4(), email="ghost@example.com", role=Role.USER)

    response = await client.get(TRIPS_URL, headers=headers_for(ghost))

    assert response.status_code == 401
