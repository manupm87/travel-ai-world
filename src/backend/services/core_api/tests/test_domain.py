"""The entities' own rules, with no storage and no HTTP."""

import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from core_api.domain.enums import ChatRole
from core_api.domain.models import (
    Accommodation,
    ChatMessage,
    ChatThread,
    ItineraryDay,
    Transportation,
    Trip,
    User,
    phase_of,
)
from travel_common.exceptions import TripLocked, UnprocessableEntity
from travel_common.principal import Role

TODAY = datetime.now(UTC).date()


def a_trip(**fields: object) -> Trip:
    base: dict[str, object] = {
        "user_id": uuid.uuid4(),
        "title": "Budapest",
        "city_slug": "budapest",
        "city": "Budapest",
        "country": "Hungary",
        "country_code": "HU",
    }
    return Trip(**{**base, **fields})  # type: ignore[arg-type]


def test_new_entities_get_ids_timestamps_and_version_zero():
    trip = a_trip()
    user = User(email="a@example.com")

    assert isinstance(trip.id, uuid.UUID)
    assert isinstance(user.id, uuid.UUID), "user ids are UUIDs now (ADR 0023)"
    assert trip.created_at.tzinfo is not None
    assert (trip.version, user.version) == (0, 0)
    assert (user.role, user.is_active, user.auth_provider) == (
        Role.USER,
        True,
        "google",
    )
    assert trip.itinerary_days == [] and trip.accommodations == []


def test_each_entity_gets_its_own_lists():
    first, second = a_trip(), a_trip()
    first.itinerary_days.append(ItineraryDay(trip_id=first.id, day_number=1))

    assert second.itinerary_days == []


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (None, None, "upcoming"),
        (TODAY + timedelta(days=1), None, "upcoming"),
        (TODAY, TODAY, "ongoing"),
        (TODAY - timedelta(days=3), None, "ongoing"),
        (TODAY - timedelta(days=3), TODAY - timedelta(days=1), "past"),
    ],
)
def test_the_phase_comes_from_the_dates(
    start: date | None, end: date | None, expected: str
):
    trip = a_trip(start_date=start, end_date=end)

    assert trip.phase == expected == phase_of(start, end, TODAY)


def test_only_an_upcoming_trip_is_editable():
    a_trip(start_date=TODAY + timedelta(days=10)).ensure_editable()

    with pytest.raises(TripLocked) as locked:
        a_trip(start_date=TODAY - timedelta(days=5), end_date=TODAY).ensure_editable()
    assert locked.value.extras == {"phase": "ongoing"}


def test_trip_dates_must_be_ordered():
    a_trip(start_date=TODAY, end_date=TODAY).check_invariants()

    with pytest.raises(UnprocessableEntity, match="Trip dates"):
        a_trip(start_date=TODAY, end_date=TODAY - timedelta(days=1)).check_invariants()


def test_the_trip_checks_only_its_own_fields():
    """Children are checked when they are written, not through the trip."""
    trip = a_trip()
    trip.accommodations.append(
        Accommodation(
            trip_id=trip.id,
            name="x",
            check_in=TODAY,
            check_out=TODAY - timedelta(days=1),
        )
    )

    trip.check_invariants()


def test_a_stay_and_a_journey_must_end_after_they_start():
    trip_id = uuid.uuid4()
    later = datetime(2027, 5, 10, 10, tzinfo=UTC)

    with pytest.raises(UnprocessableEntity, match="Stay"):
        Accommodation(
            trip_id=trip_id, name="x", check_in=TODAY, check_out=TODAY - timedelta(1)
        ).check_invariants()
    with pytest.raises(UnprocessableEntity, match="Journey"):
        Transportation(
            trip_id=trip_id,
            departure_time=later,
            arrival_time=later - timedelta(hours=1),
        ).check_invariants()


def test_a_user_turn_carries_no_model_or_usage():
    thread = ChatThread(user_id=uuid.uuid4())
    ChatMessage(thread_id=thread.id, role=ChatRole.USER, content="?").check_invariants()
    ChatMessage(
        thread_id=thread.id,
        role=ChatRole.ASSISTANT,
        content="!",
        model="m",
        input_tokens=1,
        sources=[{"doc_id": "d"}],
    ).check_invariants()

    with pytest.raises(UnprocessableEntity, match="only answers"):
        ChatMessage(
            thread_id=thread.id, role=ChatRole.USER, content="?", latency_ms=5
        ).check_invariants()


def test_money_is_decimal_and_entities_have_no_storage_fields():
    day = ItineraryDay(
        trip_id=uuid.uuid4(), day_number=1, estimated_cost=Decimal("12.50")
    )

    assert day.estimated_cost == Decimal("12.50")
    assert not hasattr(day, "__dict__"), "slots: no stray attributes"
