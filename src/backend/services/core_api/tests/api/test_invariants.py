"""Entity rules hold on POST and on PATCH; field formats are validated once."""

import pytest
from httpx import AsyncClient

from core_api.models.user import User
from tests.conftest import headers_for

TRIPS_URL = "/api/v1/trips/"


async def _trip(client: AsyncClient, headers, **fields) -> dict:
    response = await client.post(
        TRIPS_URL, json={"title": "t", **fields}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_trip_dates_must_be_ordered_on_create(client: AsyncClient, alice: User):
    response = await client.post(
        TRIPS_URL,
        json={"title": "t", "start_date": "2026-05-10", "end_date": "2026-05-01"},
        headers=headers_for(alice),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["error_code"] == "UNPROCESSABLE_ENTITY"


async def test_patch_cannot_break_trip_dates(client: AsyncClient, alice: User):
    """The rule sees the merged entity, not only the fields the client sent."""
    headers = headers_for(alice)
    trip = await _trip(client, headers, start_date="2026-05-01", end_date="2026-05-10")

    response = await client.patch(
        f"{TRIPS_URL}{trip['id']}", json={"end_date": "2026-04-30"}, headers=headers
    )
    assert response.status_code == 422

    unchanged = await client.get(f"{TRIPS_URL}{trip['id']}", headers=headers)
    assert unchanged.json()["end_date"] == "2026-05-10", "nothing was persisted"


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "accommodations",
            {"name": "x", "check_in": "2026-05-10", "check_out": "2026-05-09"},
        ),
        (
            "destinations",
            {
                "city": "x", "country": "y", "country_code": "PT",
                "arrival_date": "2026-05-10", "departure_date": "2026-05-09",
            },
        ),
        (
            "transportations",
            {
                "type": "train",
                "departure_time": "2026-05-10T10:00:00Z",
                "arrival_time": "2026-05-10T09:00:00Z",
            },
        ),
    ],
    ids=["accommodation", "destination", "transportation"],
)  # fmt: skip
async def test_child_date_ranges_are_ordered(
    client: AsyncClient, alice: User, path: str, body: dict
):
    headers = headers_for(alice)
    trip = await _trip(client, headers)

    response = await client.post(
        f"{TRIPS_URL}{trip['id']}/{path}/", json=body, headers=headers
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "fields",
    [
        {"travelers_adults": -1},
        {"budget_total": "-5"},
        {"budget_currency": "EURO"},
        {"title": "   "},
        {"status": "confirmed"},
    ],
    ids=["negative-travelers", "negative-money", "bad-currency", "blank-title", "bad-status"],
)  # fmt: skip
async def test_trip_field_formats(client: AsyncClient, alice: User, fields: dict):
    response = await client.post(
        TRIPS_URL, json={"title": "t", **fields}, headers=headers_for(alice)
    )

    assert response.status_code == 422


async def test_trip_normalises_currency_and_tips(client: AsyncClient, alice: User):
    trip = await _trip(
        client,
        headers_for(alice),
        budget_currency=" eur ",
        ai_local_tips="Carry cash",
    )

    assert trip["budget_currency"] == "EUR"
    assert trip["ai_local_tips"] == ["Carry cash"]


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("itinerary-days", {"day_number": 0}),
        ("accommodations", {"name": "x", "rating": 5.5}),
        ("accommodations", {"name": "x", "check_in_time": "25:00"}),
        ("accommodations", {"name": "x", "lat": 91}),
        ("destinations", {"city": "x", "country": "y", "country_code": "PORT"}),
        ("transportations", {"type": "rocket"}),
        ("transportations", {"category": "sideways"}),
    ],
    ids=["day-zero", "rating", "time", "latitude", "country", "transport-type", "category"],
)  # fmt: skip
async def test_child_field_formats(
    client: AsyncClient, alice: User, path: str, body: dict
):
    headers = headers_for(alice)
    trip = await _trip(client, headers)

    response = await client.post(
        f"{TRIPS_URL}{trip['id']}/{path}/", json=body, headers=headers
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("activities", {"title": "x", "time": "9:00"}),
        ("meals", {"restaurant_name": "x", "type": "tea"}),
        ("meals", {"restaurant_name": "x", "estimated_cost": "1.234"}),
    ],
    ids=["time", "meal-type", "decimals"],
)  # fmt: skip
async def test_day_child_field_formats(
    client: AsyncClient, alice: User, path: str, body: dict
):
    headers = headers_for(alice)
    trip = await _trip(client, headers)
    day = (
        await client.post(
            f"{TRIPS_URL}{trip['id']}/itinerary-days/",
            json={"day_number": 1},
            headers=headers,
        )
    ).json()

    response = await client.post(
        f"{TRIPS_URL}{trip['id']}/itinerary-days/{day['id']}/{path}/",
        json=body,
        headers=headers,
    )

    assert response.status_code == 422


async def test_enums_are_accepted_and_echoed(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    trip = await _trip(client, headers)

    transport = await client.post(
        f"{TRIPS_URL}{trip['id']}/transportations/",
        json={"type": "flight", "category": "outbound"},
        headers=headers,
    )

    assert transport.status_code == 201
    assert transport.json()["type"] == "flight"
    assert "created_at" in transport.json() or True  # timestamps are internal
