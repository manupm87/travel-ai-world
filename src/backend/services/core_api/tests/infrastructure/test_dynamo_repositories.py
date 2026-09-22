"""The single-table adapter against moto: keys, conditions, cascades, order."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from core_api.domain.enums import ChatRole
from core_api.domain.models import (
    Activity,
    ChatMessage,
    ChatThread,
    ItineraryDay,
    Trip,
    User,
)
from core_api.infrastructure.dynamo.repositories import (
    MAX_TRIP_BYTES,
    DynamoChatMessageRepository,
    DynamoChatThreadRepository,
    DynamoTripRepository,
    DynamoUserRepository,
)
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.pagination import Page
from travel_common.dynamodb import from_item
from travel_common.exceptions import Conflict, UnprocessableEntity

CARD: dict[str, Any] = {"id": "osm:node/1", "score": 0.25, "note": None, "tags": []}


@pytest.fixture
def users(table: DynamoTable) -> DynamoUserRepository:
    return DynamoUserRepository(table)


@pytest.fixture
def trips(table: DynamoTable) -> DynamoTripRepository:
    return DynamoTripRepository(table)


@pytest.fixture
def threads(table: DynamoTable) -> DynamoChatThreadRepository:
    return DynamoChatThreadRepository(table)


@pytest.fixture
def messages(table: DynamoTable) -> DynamoChatMessageRepository:
    return DynamoChatMessageRepository(table)


def all_items(table: DynamoTable) -> list[dict[str, Any]]:
    response = table.client.scan(TableName=table.name)
    return [from_item(item) for item in response["Items"]]


def keys_of(table: DynamoTable) -> set[tuple[str, str]]:
    return {(item["PK"], item["SK"]) for item in all_items(table)}


def a_trip(owner: uuid.UUID, **fields: Any) -> Trip:
    base: dict[str, Any] = {
        "user_id": owner,
        "title": "Budapest",
        "city_slug": "budapest",
        "city": "Budapest",
        "country": "Hungary",
        "country_code": "HU",
    }
    return Trip(**{**base, **fields})


def a_message(thread: ChatThread, content: str, **fields: Any) -> ChatMessage:
    return ChatMessage(
        thread_id=thread.id, role=ChatRole.USER, content=content, **fields
    )


# ── Key layout ──────────────────────────────────────────────────────────────


async def test_every_item_type_has_its_key(
    table: DynamoTable,
    users: DynamoUserRepository,
    trips: DynamoTripRepository,
    threads: DynamoChatThreadRepository,
    messages: DynamoChatMessageRepository,
):
    user = await users.add(User(email="Ada@Example.com"))
    trip = await trips.add(a_trip(user.id))
    thread = await threads.add(ChatThread(user_id=user.id))
    at = datetime(2026, 9, 22, 10, 0, 0, 5, tzinfo=UTC)
    message = await messages.append(thread, a_message(thread, "hi", created_at=at))

    assert keys_of(table) == {
        (f"USER#{user.id}", "PROFILE"),
        ("EMAIL#ada@example.com", "EMAIL"),
        (f"USER#{user.id}", f"TRIP#{trip.id}"),
        (f"USER#{user.id}", f"THREAD#{thread.id}"),
        (f"THREAD#{thread.id}", f"MSG#2026-09-22T10:00:00.000005+00:00#{message.id}"),
    }
    profile = next(i for i in all_items(table) if i["SK"] == "PROFILE")
    assert (profile["GSI1PK"], profile["GSI1SK"]) == ("USERS", "Ada@Example.com")
    lookup = next(i for i in all_items(table) if i["SK"] == "EMAIL")
    assert lookup["user_id"] == str(user.id)


async def test_a_trip_round_trips_whole(trips: DynamoTripRepository):
    owner = uuid.uuid4()
    trip = a_trip(
        owner,
        lat=47.4979,
        budget_total=Decimal("1200.50"),
        travel_style=["culture"],
        start_date=datetime(2027, 5, 1, tzinfo=UTC).date(),
    )
    day = ItineraryDay(trip_id=trip.id, day_number=1, estimated_cost=Decimal("30"))
    day.activities.append(
        Activity(itinerary_day_id=day.id, title="Baths", rating=4.5, card=CARD)
    )
    trip.itinerary_days.append(day)
    await trips.add(trip)

    loaded = await trips.get(owner, trip.id)

    assert loaded == trip, "field for field, children included"
    assert loaded is not None
    assert loaded.lat == 47.4979 and isinstance(loaded.lat, float)
    assert loaded.budget_total == Decimal("1200.50")
    assert loaded.itinerary_days[0].estimated_cost == Decimal("30.00")
    activity = loaded.itinerary_days[0].activities[0]
    assert activity.card == CARD, "opaque JSON comes back untouched, nulls included"
    assert activity == day.activities[0]


async def test_another_owner_does_not_find_the_trip(trips: DynamoTripRepository):
    trip = await trips.add(a_trip(uuid.uuid4()))

    assert await trips.get(uuid.uuid4(), trip.id) is None


# ── Users: uniqueness and versions ──────────────────────────────────────────


async def test_a_taken_email_is_a_conflict(users: DynamoUserRepository):
    await users.add(User(email="ada@example.com"))

    with pytest.raises(Conflict, match="email already registered"):
        await users.add(User(email="ADA@example.com"))


async def test_an_email_change_moves_the_lookup(
    table: DynamoTable, users: DynamoUserRepository
):
    ada = await users.add(User(email="ada@example.com"))
    ada.email = "lovelace@example.com"

    await users.save(ada)

    assert await users.get_by_email("ada@example.com") is None
    found = await users.get_by_email("lovelace@example.com")
    assert found is not None and found.id == ada.id
    assert ("EMAIL#ada@example.com", "EMAIL") not in keys_of(table)


async def test_changing_to_a_taken_email_is_a_conflict(users: DynamoUserRepository):
    await users.add(User(email="bob@example.com"))
    ada = await users.add(User(email="ada@example.com"))
    ada.email = "bob@example.com"

    with pytest.raises(Conflict, match="email already registered"):
        await users.save(ada)

    still = await users.get_by_email("ada@example.com")
    assert still is not None and still.id == ada.id


async def test_a_stale_version_is_a_conflict(
    users: DynamoUserRepository, trips: DynamoTripRepository
):
    ada = await users.add(User(email="ada@example.com"))
    first, second = await users.get(ada.id), await users.get(ada.id)
    assert first is not None and second is not None
    first.name = "Ada"
    await users.save(first)
    second.name = "Lovelace"
    with pytest.raises(Conflict, match="reload and retry"):
        await users.save(second)

    trip = await trips.add(a_trip(ada.id))
    one, two = await trips.get(ada.id, trip.id), await trips.get(ada.id, trip.id)
    assert one is not None and two is not None
    await trips.save(one)
    assert one.version == 1
    with pytest.raises(Conflict):
        await trips.save(two)


async def test_adding_the_same_trip_twice_is_a_conflict(trips: DynamoTripRepository):
    trip = await trips.add(a_trip(uuid.uuid4()))

    with pytest.raises(Conflict):
        await trips.add(trip)


async def test_users_are_listed_by_email_and_paged(users: DynamoUserRepository):
    for email in ("carol@example.com", "ada@example.com", "bob@example.com"):
        await users.add(User(email=email))

    everyone = await users.list(Page())
    page = await users.list(Page(skip=1, limit=1))

    assert [u.email for u in everyone] == [
        "ada@example.com",
        "bob@example.com",
        "carol@example.com",
    ]
    assert [u.email for u in page] == ["bob@example.com"]


# ── Deletes: no database cascades ───────────────────────────────────────────


async def test_deleting_a_thread_removes_its_messages(
    table: DynamoTable,
    threads: DynamoChatThreadRepository,
    messages: DynamoChatMessageRepository,
):
    owner = uuid.uuid4()
    thread = await threads.add(ChatThread(user_id=owner))
    kept = await threads.add(ChatThread(user_id=owner))
    for n in range(30):  # more than one batch of 25
        await messages.append(thread, a_message(thread, f"m{n}"))
    await messages.append(kept, a_message(kept, "stays"))

    await threads.delete(thread)

    assert await threads.get(owner, thread.id) is None
    assert await messages.list_in(thread.id, Page()) == []
    assert [m.content for m in await messages.list_in(kept.id, Page())] == ["stays"]


async def test_deleting_a_user_removes_everything_it_owns(
    table: DynamoTable,
    users: DynamoUserRepository,
    trips: DynamoTripRepository,
    threads: DynamoChatThreadRepository,
    messages: DynamoChatMessageRepository,
):
    ada = await users.add(User(email="ada@example.com"))
    bob = await users.add(User(email="bob@example.com"))
    await trips.add(a_trip(ada.id))
    await trips.add(a_trip(ada.id))
    thread = await threads.add(ChatThread(user_id=ada.id))
    await messages.append(thread, a_message(thread, "hi"))
    bobs_trip = await trips.add(a_trip(bob.id))

    await users.delete(ada)

    assert keys_of(table) == {
        (f"USER#{bob.id}", "PROFILE"),
        ("EMAIL#bob@example.com", "EMAIL"),
        (f"USER#{bob.id}", f"TRIP#{bobs_trip.id}"),
    }


# ── Messages: order and paging ──────────────────────────────────────────────


async def test_messages_with_the_same_clock_reading_stay_in_order(
    threads: DynamoChatThreadRepository, messages: DynamoChatMessageRepository
):
    """A question and its answer written within one clock tick (ADR 0013)."""
    frozen = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
    thread = await threads.add(ChatThread(user_id=uuid.uuid4()))

    question = await messages.append(
        thread, a_message(thread, "question", created_at=frozen)
    )
    answer = await messages.append(
        thread, a_message(thread, "answer", created_at=frozen)
    )
    early = await messages.append(
        thread, a_message(thread, "clock went back", created_at=frozen)
    )

    assert question.created_at == frozen
    assert answer.created_at == frozen + timedelta(microseconds=1)
    assert early.created_at == frozen + timedelta(microseconds=2)
    listed = await messages.list_in(thread.id, Page())
    assert [m.content for m in listed] == ["question", "answer", "clock went back"]


async def test_an_append_moves_the_thread(
    threads: DynamoChatThreadRepository, messages: DynamoChatMessageRepository
):
    owner = uuid.uuid4()
    thread = await threads.add(ChatThread(user_id=owner))
    later = thread.updated_at + timedelta(seconds=5)

    await messages.append(thread, a_message(thread, "hi", created_at=later))

    stored = await threads.get(owner, thread.id)
    assert stored is not None
    assert stored.updated_at == later
    assert stored.version == thread.version == 1


async def test_an_append_does_not_race_a_rename(
    threads: DynamoChatThreadRepository, messages: DynamoChatMessageRepository
):
    """ai_api appends while another request renames the thread: both land."""
    owner = uuid.uuid4()
    thread = await threads.add(ChatThread(user_id=owner))
    stale = await threads.get(owner, thread.id)
    assert stale is not None

    renamed = await threads.get(owner, thread.id)
    assert renamed is not None
    renamed.title = "Budapest in May"
    await threads.save(renamed)

    await messages.append(stale, a_message(stale, "hi"))

    stored = await threads.get(owner, thread.id)
    assert stored is not None
    assert stored.title == "Budapest in May"
    assert stored.version == 2
    assert [m.content for m in await messages.list_in(thread.id, Page())] == ["hi"]


async def test_an_append_to_a_deleted_thread_is_a_conflict(
    threads: DynamoChatThreadRepository, messages: DynamoChatMessageRepository
):
    owner = uuid.uuid4()
    thread = await threads.add(ChatThread(user_id=owner))
    await threads.delete(thread)

    with pytest.raises(Conflict):
        await messages.append(thread, a_message(thread, "hi"))


async def test_messages_page_in_order(
    threads: DynamoChatThreadRepository, messages: DynamoChatMessageRepository
):
    thread = await threads.add(ChatThread(user_id=uuid.uuid4()))
    for n in range(5):
        await messages.append(thread, a_message(thread, f"m{n}"))

    page = await messages.list_in(thread.id, Page(skip=1, limit=2))

    assert [m.content for m in page] == ["m1", "m2"]


# ── Lists of a user's items ─────────────────────────────────────────────────


async def test_trips_are_listed_by_creation(trips: DynamoTripRepository):
    owner = uuid.uuid4()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for n in (2, 0, 1):
        await trips.add(
            a_trip(owner, title=f"t{n}", created_at=start + timedelta(minutes=n))
        )
    await trips.add(a_trip(uuid.uuid4(), title="someone else's"))

    listed = await trips.list_for(owner)

    assert [t.title for t in listed] == ["t0", "t1", "t2"]


async def test_threads_are_listed_most_recent_first(
    threads: DynamoChatThreadRepository,
):
    owner = uuid.uuid4()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for n in (0, 2, 1):
        await threads.add(
            ChatThread(
                user_id=owner, title=f"c{n}", updated_at=start + timedelta(hours=n)
            )
        )

    listed = await threads.list_for(owner)

    assert [t.title for t in listed] == ["c2", "c1", "c0"]


# ── Size guard ──────────────────────────────────────────────────────────────


async def test_a_trip_too_large_for_one_item_is_refused(trips: DynamoTripRepository):
    trip = a_trip(uuid.uuid4(), description="x" * (MAX_TRIP_BYTES + 1))

    with pytest.raises(UnprocessableEntity, match="too large"):
        await trips.add(trip)

    small = await trips.add(a_trip(trip.user_id))
    small.description = "x" * (MAX_TRIP_BYTES + 1)
    with pytest.raises(UnprocessableEntity, match="too large"):
        await trips.save(small)
