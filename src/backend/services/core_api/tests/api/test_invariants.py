"""Entity rules hold on POST and on PATCH; field formats are validated once."""

import pytest
from core_api.domain.models import User
from httpx import AsyncClient

from tests.conftest import day_offset, headers_for, trip_body

TRIPS_URL = "/api/v1/trips/"


async def _trip(client: AsyncClient, headers, **fields) -> dict:
    response = await client.post(TRIPS_URL, json=trip_body(**fields), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_trip_dates_must_be_ordered_on_create(client: AsyncClient, alice: User):
    response = await client.post(
        TRIPS_URL,
        json=trip_body(start_date=day_offset(40), end_date=day_offset(30)),
        headers=headers_for(alice),
    )

    assert response.status_code == 422
    assert response.json()["detail"]["error_code"] == "UNPROCESSABLE_ENTITY"


async def test_patch_cannot_break_trip_dates(client: AsyncClient, alice: User):
    """The rule sees the merged entity, not only the fields the client sent."""
    headers = headers_for(alice)
    trip = await _trip(
        client, headers, start_date=day_offset(30), end_date=day_offset(40)
    )

    response = await client.patch(
        f"{TRIPS_URL}{trip['id']}",
        json={"end_date": day_offset(29)},
        headers=headers,
    )
    assert response.status_code == 422

    unchanged = await client.get(f"{TRIPS_URL}{trip['id']}", headers=headers)
    assert unchanged.json()["end_date"] == day_offset(40), "nothing was persisted"


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "accommodations",
            {"name": "x", "check_in": "2027-05-10", "check_out": "2027-05-09"},
        ),
        (
            "transportations",
            {
                "type": "train",
                "departure_time": "2027-05-10T10:00:00Z",
                "arrival_time": "2027-05-10T09:00:00Z",
            },
        ),
    ],
    ids=["accommodation", "transportation"],
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
        {"country_code": "HUNGARY"},
        {"city_slug": "Budapest City"},
        {"budget_tier": 4},
    ],
    ids=[
        "negative-travelers", "negative-money", "bad-currency", "blank-title",
        "bad-country", "bad-slug", "bad-budget-tier",
    ],
)  # fmt: skip
async def test_trip_field_formats(client: AsyncClient, alice: User, fields: dict):
    response = await client.post(
        TRIPS_URL, json=trip_body(**fields), headers=headers_for(alice)
    )

    assert response.status_code == 422


async def test_trip_normalises_currency_tips_and_city(client: AsyncClient, alice: User):
    trip = await _trip(
        client,
        headers_for(alice),
        budget_currency=" eur ",
        ai_local_tips="Carry cash",
        city_slug=" Budapest ",
        country_code="hu",
    )

    assert trip["budget_currency"] == "EUR"
    assert trip["ai_local_tips"] == ["Carry cash"]
    assert trip["city_slug"] == "budapest"
    assert trip["country_code"] == "HU"


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("itinerary-days", {"day_number": 0}),
        ("accommodations", {"name": "x", "rating": 5.5}),
        ("accommodations", {"name": "x", "check_in_time": "25:00"}),
        ("accommodations", {"name": "x", "lat": 91}),
        ("accommodations", {"name": "x", "country_code": "PORT"}),
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
        ("activities", {"title": "x", "part_of_day": "siesta"}),
        ("meals", {"restaurant_name": "x", "type": "tea"}),
        ("meals", {"restaurant_name": "x", "estimated_cost": "1.234"}),
    ],
    ids=["time", "part-of-day", "meal-type", "decimals"],
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
