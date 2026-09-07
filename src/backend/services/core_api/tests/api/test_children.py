"""Child resources live inside the owner's trip.

The same contract holds for every collection: scoped listing, 404 (never a
leak) for anything under someone else's trip, partial PATCH, cascade delete.
"""

from dataclasses import dataclass
from typing import Any

import pytest
from httpx import AsyncClient

from core_api.models.user import User
from tests.conftest import headers_for

TRIPS_URL = "/api/v1/trips/"
MISSING = "00000000-0000-0000-0000-000000000000"


@dataclass(frozen=True)
class Child:
    path: str
    create: dict[str, Any]
    patch: dict[str, Any]
    under_day: bool = False

    def url(self, trip_id: str, day_id: str | None = None) -> str:
        base = f"{TRIPS_URL}{trip_id}"
        if self.under_day:
            base = f"{base}/itinerary-days/{day_id}"
        return f"{base}/{self.path}/"


CHILDREN = [
    pytest.param(
        Child(
            "destinations",
            {"city": "Lisboa", "country": "Portugal", "country_code": "PT"},
            {"city": "Porto"},
        ),
        id="destinations",
    ),
    pytest.param(
        Child("itinerary-days", {"day_number": 1}, {"title": "Arrival"}),
        id="itinerary-days",
    ),
    pytest.param(
        Child("accommodations", {"name": "Hotel Avenida"}, {"name": "Hostel"}),
        id="accommodations",
    ),
    pytest.param(
        Child("transportations", {"type": "flight"}, {"provider": "TAP"}),
        id="transportations",
    ),
    pytest.param(
        Child("activities", {"title": "Belém"}, {"title": "Alfama"}, under_day=True),
        id="activities",
    ),
    pytest.param(
        Child(
            "meals", {"restaurant_name": "Ramiro"}, {"cuisine": "seafood"},
            under_day=True,
        ),
        id="meals",
    ),
]  # fmt: skip


async def _trip_with_day(client: AsyncClient, headers) -> tuple[str, str]:
    trip = (await client.post(TRIPS_URL, json={"title": "t"}, headers=headers)).json()
    day = (
        await client.post(
            f"{TRIPS_URL}{trip['id']}/itinerary-days/",
            json={"day_number": 1},
            headers=headers,
        )
    ).json()
    return trip["id"], day["id"]


@pytest.mark.parametrize("child", CHILDREN)
async def test_crud_inside_own_trip(client: AsyncClient, alice: User, child: Child):
    headers = headers_for(alice)
    trip_id, day_id = await _trip_with_day(client, headers)
    url = child.url(trip_id, day_id)

    created = await client.post(url, json=child.create, headers=headers)
    assert created.status_code == 201, created.text
    item = created.json()
    parent_field = "itinerary_day_id" if child.under_day else "trip_id"
    assert item[parent_field] == (day_id if child.under_day else trip_id)

    listed = await client.get(url, headers=headers)
    assert item["id"] in [i["id"] for i in listed.json()]

    read = await client.get(f"{url}{item['id']}", headers=headers)
    assert read.status_code == 200

    patched = await client.patch(
        f"{url}{item['id']}", json=child.patch, headers=headers
    )
    assert patched.status_code == 200
    for field, value in child.patch.items():
        assert patched.json()[field] == value
    for field, value in child.create.items():
        if field not in child.patch:
            assert patched.json()[field] == value, "PATCH keeps untouched fields"

    deleted = await client.delete(f"{url}{item['id']}", headers=headers)
    assert deleted.status_code == 204
    assert (await client.get(f"{url}{item['id']}", headers=headers)).status_code == 404


@pytest.mark.parametrize("child", CHILDREN)
async def test_other_users_trip_is_forbidden_for_children(
    client: AsyncClient, alice: User, bob: User, child: Child
):
    trip_id, day_id = await _trip_with_day(client, headers_for(alice))
    url = child.url(trip_id, day_id)
    item = (
        await client.post(url, json=child.create, headers=headers_for(alice))
    ).json()

    bob_headers = headers_for(bob)
    assert (await client.get(url, headers=bob_headers)).status_code == 403
    assert (
        await client.post(url, json=child.create, headers=bob_headers)
    ).status_code == 403
    assert (
        await client.get(f"{url}{item['id']}", headers=bob_headers)
    ).status_code == 403
    assert (
        await client.patch(f"{url}{item['id']}", json=child.patch, headers=bob_headers)
    ).status_code == 403
    assert (
        await client.delete(f"{url}{item['id']}", headers=bob_headers)
    ).status_code == 403

    # Nothing changed for the owner.
    still = await client.get(f"{url}{item['id']}", headers=headers_for(alice))
    assert still.status_code == 200
    assert still.json() == item


@pytest.mark.parametrize("child", CHILDREN)
async def test_child_of_another_trip_is_not_found(
    client: AsyncClient, alice: User, child: Child
):
    """Same owner, wrong parent: the row exists but not under this path."""
    headers = headers_for(alice)
    trip_a, day_a = await _trip_with_day(client, headers)
    trip_b, day_b = await _trip_with_day(client, headers)
    item = (
        await client.post(child.url(trip_a, day_a), json=child.create, headers=headers)
    ).json()

    wrong = f"{child.url(trip_b, day_b)}{item['id']}"
    assert (await client.get(wrong, headers=headers)).status_code == 404
    assert (
        await client.patch(wrong, json=child.patch, headers=headers)
    ).status_code == 404
    assert (await client.delete(wrong, headers=headers)).status_code == 404
    listed = await client.get(child.url(trip_b, day_b), headers=headers)
    assert item["id"] not in [i["id"] for i in listed.json()]


async def test_day_under_wrong_trip_is_not_found(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    _, day_a = await _trip_with_day(client, headers)
    trip_b, _ = await _trip_with_day(client, headers)

    response = await client.get(
        f"{TRIPS_URL}{trip_b}/itinerary-days/{day_a}/activities/", headers=headers
    )

    assert response.status_code == 404
    assert response.json()["detail"]["message"] == "ItineraryDay not found"


async def test_trip_response_embeds_children(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    trip_id, day_id = await _trip_with_day(client, headers)
    await client.post(
        f"{TRIPS_URL}{trip_id}/itinerary-days/{day_id}/meals/",
        json={"restaurant_name": "Ramiro"},
        headers=headers,
    )

    trip = (await client.get(f"{TRIPS_URL}{trip_id}", headers=headers)).json()

    assert trip["itinerary_days"][0]["meals"][0]["restaurant_name"] == "Ramiro"


async def test_deleting_trip_cascades(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    trip_id, day_id = await _trip_with_day(client, headers)

    assert (
        await client.delete(f"{TRIPS_URL}{trip_id}", headers=headers)
    ).status_code == 204
    response = await client.get(
        f"{TRIPS_URL}{trip_id}/itinerary-days/{day_id}", headers=headers
    )
    assert response.status_code == 404


async def test_requires_authentication(client: AsyncClient):
    response = await client.get(f"{TRIPS_URL}{MISSING}/destinations/")

    assert response.status_code == 401
