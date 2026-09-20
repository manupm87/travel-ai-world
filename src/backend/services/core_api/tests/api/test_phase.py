"""A trip's phase is derived from its dates, and past trips are read-only.

Nothing stores the phase (ADR 0019): the same trip is upcoming, then ongoing,
then past, without anybody writing to it. Once it is not upcoming any more it
refuses every write — except its own deletion, which is not a change.
"""

from datetime import date

import pytest
from core_api.models.trip import phase_of
from core_api.models.user import User
from httpx import AsyncClient

from tests.conftest import day_offset, headers_for, trip_body

TRIPS_URL = "/api/v1/trips/"
TODAY = date(2026, 5, 10)


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (None, None, "upcoming"),
        (date(2026, 5, 11), date(2026, 5, 20), "upcoming"),
        (date(2026, 5, 11), None, "upcoming"),
        (None, date(2026, 5, 20), "upcoming"),
        (None, date(2026, 5, 10), "upcoming"),
        (date(2026, 5, 10), date(2026, 5, 20), "ongoing"),
        (date(2026, 5, 1), date(2026, 5, 10), "ongoing"),
        (date(2026, 5, 1), date(2026, 5, 20), "ongoing"),
        (date(2026, 5, 1), None, "ongoing"),
        (date(2026, 5, 10), date(2026, 5, 10), "ongoing"),
        (date(2026, 5, 1), date(2026, 5, 9), "past"),
        (None, date(2026, 5, 9), "past"),
    ],
    ids=[
        "no-dates", "both-ahead", "starts-tomorrow", "ends-later-no-start",
        "ends-today-no-start",
        "starts-today", "ends-today", "around-today", "started-open-ended",
        "single-day", "over", "ended-no-start",
    ],
)  # fmt: skip
def test_phase_of(start: date | None, end: date | None, expected: str):
    assert phase_of(start, end, TODAY) == expected


async def _trip(client: AsyncClient, headers, **fields) -> dict:
    response = await client.post(TRIPS_URL, json=trip_body(**fields), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


async def test_the_response_carries_the_phase(client: AsyncClient, alice: User):
    headers = headers_for(alice)

    upcoming = await _trip(client, headers, start_date=day_offset(30))
    ongoing = await _trip(
        client, headers, start_date=day_offset(-1), end_date=day_offset(1)
    )
    past = await _trip(
        client, headers, start_date=day_offset(-40), end_date=day_offset(-38)
    )

    assert (upcoming["phase"], ongoing["phase"], past["phase"]) == (
        "upcoming",
        "ongoing",
        "past",
    )
    listed = await client.get(TRIPS_URL, headers=headers)
    assert {t["id"]: t["phase"] for t in listed.json()} == {
        upcoming["id"]: "upcoming",
        ongoing["id"]: "ongoing",
        past["id"]: "past",
    }


async def test_an_upcoming_trip_is_editable(client: AsyncClient, alice: User):
    headers = headers_for(alice)
    trip = await _trip(client, headers, start_date=day_offset(30))

    renamed = await client.patch(
        f"{TRIPS_URL}{trip['id']}", json={"title": "Budapest again"}, headers=headers
    )

    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Budapest again"


@pytest.mark.parametrize(
    ("start", "end"),
    [(-1, 1), (-40, -38)],
    ids=["ongoing", "past"],
)
async def test_a_locked_trip_refuses_every_write(
    client: AsyncClient, alice: User, start: int, end: int
):
    headers = headers_for(alice)
    trip = await _trip(
        client, headers, start_date=day_offset(start), end_date=day_offset(end)
    )

    patched = await client.patch(
        f"{TRIPS_URL}{trip['id']}", json={"title": "nope"}, headers=headers
    )

    assert patched.status_code == 409
    detail = patched.json()["detail"]
    assert detail["error_code"] == "TRIP_LOCKED"
    assert detail["extras"]["phase"] == trip["phase"]

    still = await client.get(f"{TRIPS_URL}{trip['id']}", headers=headers)
    assert still.status_code == 200, "reading a locked trip is what the planner does"
    assert still.json()["title"] == trip["title"]


async def test_children_of_a_locked_trip_refuse_writes(
    client: AsyncClient, alice: User
):
    """The lock is the aggregate's, so it holds for everything inside it."""
    headers = headers_for(alice)
    trip = await _trip(client, headers, start_date=day_offset(30))
    day = (
        await client.post(
            f"{TRIPS_URL}{trip['id']}/itinerary-days/",
            json={"day_number": 1},
            headers=headers,
        )
    ).json()
    activity = (
        await client.post(
            f"{TRIPS_URL}{trip['id']}/itinerary-days/{day['id']}/activities/",
            json={"title": "Baths", "part_of_day": "morning"},
            headers=headers,
        )
    ).json()

    # The same trip, now over.
    locked = await client.patch(
        f"{TRIPS_URL}{trip['id']}",
        json={"start_date": day_offset(-40), "end_date": day_offset(-38)},
        headers=headers,
    )
    assert locked.status_code == 200, locked.text

    days_url = f"{TRIPS_URL}{trip['id']}/itinerary-days/"
    activities_url = f"{days_url}{day['id']}/activities/"
    for response in (
        await client.post(days_url, json={"day_number": 2}, headers=headers),
        await client.patch(
            f"{days_url}{day['id']}", json={"title": "x"}, headers=headers
        ),
        await client.delete(f"{days_url}{day['id']}", headers=headers),
        await client.post(activities_url, json={"title": "x"}, headers=headers),
        await client.patch(
            f"{activities_url}{activity['id']}", json={"title": "x"}, headers=headers
        ),
        await client.delete(f"{activities_url}{activity['id']}", headers=headers),
    ):
        assert response.status_code == 409, response.text
        assert response.json()["detail"]["error_code"] == "TRIP_LOCKED"

    reading = await client.get(activities_url, headers=headers)
    assert reading.status_code == 200
    assert [a["id"] for a in reading.json()] == [activity["id"]]


async def test_a_past_trip_can_still_be_deleted(client: AsyncClient, alice: User):
    """Removing a trip is not changing it: a traveller may always let it go."""
    headers = headers_for(alice)
    trip = await _trip(
        client, headers, start_date=day_offset(-40), end_date=day_offset(-38)
    )

    deleted = await client.delete(f"{TRIPS_URL}{trip['id']}", headers=headers)

    assert deleted.status_code == 204
    assert (
        await client.get(f"{TRIPS_URL}{trip['id']}", headers=headers)
    ).status_code == 404
