"""`infrastructure.dynamo_usage.DynamoUsageStore` against moto's DynamoDB."""

import asyncio
from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from ai_api.domain.tracing import TurnFilters
from ai_api.domain.usage import DailyUsage
from ai_api.infrastructure.dynamo_traces import DynamoTraceLog, spec
from ai_api.infrastructure.dynamo_usage import DynamoUsageStore, NullUsageStore
from ai_api.testing import make_trace
from botocore.exceptions import ClientError
from travel_common.dynamodb import dynamodb_client, ensure_table
from travel_common.exceptions import ProviderUnavailable
from travel_common.testing import mock_dynamodb

TABLE = "test-interactions"
DAY = date(2026, 9, 23)


@pytest.fixture
def client() -> Iterator[Any]:
    with mock_dynamodb():
        yield dynamodb_client("", "eu-west-1")


@pytest.fixture
async def store(client: Any) -> DynamoUsageStore:
    await ensure_table(client, spec(TABLE))
    return DynamoUsageStore(client, TABLE, ttl_days=90)


async def test_two_adds_sum_into_one_item(store: DynamoUsageStore, client: Any):
    await store.add("sub-1", DAY, input_tokens=100, output_tokens=50, embed_tokens=7)
    await store.add("sub-1", DAY, input_tokens=10, output_tokens=5, embed_tokens=1)

    usage = await store.get("sub-1", DAY)

    assert usage == DailyUsage(
        subject="sub-1",
        day="2026-09-23",
        input_tokens=110,
        output_tokens=55,
        embed_tokens=8,
        turns=2,
    )
    assert usage.tokens == 165  # the embedding tokens are not counted
    [item] = client.scan(TableName=TABLE)["Items"]
    assert item["PK"] == {"S": "USAGE#sub-1"}
    assert item["SK"] == {"S": "DAY#2026-09-23"}
    assert item["GSI1PK"] == {"S": "USAGE_DAY#2026-09-23"}
    assert item["GSI1SK"] == {"S": "sub-1"}
    assert item["item"] == {"S": "usage"}


async def test_concurrent_adds_lose_nothing(store: DynamoUsageStore):
    await asyncio.gather(
        *(
            store.add("sub-1", DAY, input_tokens=3, output_tokens=2, embed_tokens=1)
            for _ in range(20)
        )
    )

    usage = await store.get("sub-1", DAY)

    assert (usage.input_tokens, usage.output_tokens, usage.embed_tokens) == (
        60,
        40,
        20,
    )
    assert usage.turns == 20


async def test_a_day_nothing_was_counted_on_reads_as_zeros(store: DynamoUsageStore):
    await store.add("sub-1", DAY, input_tokens=1, output_tokens=1, embed_tokens=0)

    other_day = await store.get("sub-1", date(2026, 9, 24))
    other_subject = await store.get("sub-2", DAY)

    assert other_day == DailyUsage(subject="sub-1", day="2026-09-24")
    assert other_subject == DailyUsage(subject="sub-2", day="2026-09-23")
    assert other_day.tokens == 0


async def test_list_day_returns_only_that_day(store: DynamoUsageStore):
    await store.add("sub-1", DAY, input_tokens=1, output_tokens=1, embed_tokens=0)
    await store.add("sub-2", DAY, input_tokens=5, output_tokens=5, embed_tokens=0)
    await store.add(
        "sub-1", date(2026, 9, 24), input_tokens=9, output_tokens=9, embed_tokens=0
    )

    listed = await store.list_day(DAY)

    assert sorted((u.subject, u.day, u.tokens) for u in listed) == [
        ("sub-1", "2026-09-23", 2),
        ("sub-2", "2026-09-23", 10),
    ]
    assert await store.list_day(date(2026, 9, 25)) == []


async def test_list_day_reads_every_page(store: DynamoUsageStore, client: Any):
    for n in range(5):
        await store.add(
            f"sub-{n}", DAY, input_tokens=1, output_tokens=0, embed_tokens=0
        )
    real_query = client.query

    def one_per_page(**kwargs: Any) -> Any:
        return real_query(**kwargs, Limit=1)

    client.query = one_per_page
    try:
        listed = await store.list_day(DAY)
    finally:
        del client.query

    assert sorted(u.subject for u in listed) == [f"sub-{n}" for n in range(5)]


async def test_the_item_expires_with_the_tables_ttl(
    store: DynamoUsageStore, client: Any
):
    await store.add("sub-1", DAY, input_tokens=1, output_tokens=1, embed_tokens=0)
    await store.add("sub-1", DAY, input_tokens=1, output_tokens=1, embed_tokens=0)

    [item] = client.scan(TableName=TABLE)["Items"]

    # 90 days after the day is over, set once.
    expected = datetime(2026, 12, 23, tzinfo=UTC).timestamp()
    assert int(item["expires_at"]["N"]) == int(expected)


async def test_the_trace_listings_never_return_a_usage_item(
    store: DynamoUsageStore, client: Any
):
    traces = DynamoTraceLog(client, TABLE)
    trace = make_trace(subject="sub-1")
    await traces.record(trace)
    await store.add("sub-1", trace.ts.date(), input_tokens=100, output_tokens=50,
                    embed_tokens=10)  # fmt: skip

    by_day = await traces.list_day(trace.ts.date(), TurnFilters(), None, 50)
    by_subject = await traces.list_subject("sub-1", TurnFilters(), None, 50)
    in_range = [t async for t in traces.iter_range(trace.ts.date(), trace.ts.date())]

    assert [t.turn_id for t in by_day.items] == ["turn-1"]
    assert [t.turn_id for t in by_subject.items] == ["turn-1"]
    assert [t.turn_id for t in in_range] == ["turn-1"]
    # ... and the day's counters never list a turn.
    assert [u.subject for u in await store.list_day(trace.ts.date())] == ["sub-1"]


async def test_a_dynamodb_failure_is_provider_unavailable(client: Any):
    store = DynamoUsageStore(client, "no-such-table")

    with pytest.raises(ProviderUnavailable) as raised:
        await store.get("sub-1", DAY)

    assert isinstance(raised.value.__cause__, ClientError)


async def test_the_null_store_counts_nothing():
    store = NullUsageStore()

    await store.add("sub-1", DAY, input_tokens=1, output_tokens=1, embed_tokens=1)

    assert await store.get("sub-1", DAY) == DailyUsage(
        subject="sub-1", day="2026-09-23"
    )
    assert await store.list_day(DAY) == []
