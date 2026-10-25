"""`infrastructure.dynamo_eval.DynamoEvalStore` against moto's DynamoDB."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from ai_api.domain.evaluation import EvalItemRecord, EvalRunRecord
from ai_api.domain.tracing import TurnFilters
from ai_api.infrastructure.dynamo_eval import DynamoEvalStore, NullEvalStore
from ai_api.infrastructure.dynamo_traces import DynamoTraceLog, spec
from botocore.exceptions import ClientError
from travel_common.dynamodb import dynamodb_client, ensure_table
from travel_common.exceptions import ProviderUnavailable
from travel_common.testing import mock_dynamodb

TABLE = "test-interactions"
START = datetime(2026, 10, 25, 12, 0, tzinfo=UTC)


@pytest.fixture
def client() -> Iterator[Any]:
    with mock_dynamodb():
        yield dynamodb_client("", "eu-west-1")


@pytest.fixture
async def store(client: Any) -> DynamoEvalStore:
    await ensure_table(client, spec(TABLE))
    return DynamoEvalStore(client, TABLE, ttl_days=90, backoff=0)


def run(
    run_id: str, started: datetime = START, status: str = "running"
) -> EvalRunRecord:
    return EvalRunRecord(
        run_id=run_id,
        eval_set="golden",
        status=status,  # type: ignore[arg-type]
        started_at=started,
        data={"run_id": run_id, "status": status, "usd": 0.12, "note": "ñandú"},
    )


async def test_a_run_and_its_items_read_back_as_written(store: DynamoEvalStore):
    await store.save_run(run("r1"))
    items = [EvalItemRecord(f"madrid/q{n}", {"n": n}) for n in range(30)]
    await store.add_items("r1", items)  # more than one batch
    await store.save_run(run("r1", status="done"))

    detail = await store.get("r1")

    assert detail is not None
    assert detail.run.status == "done"
    assert detail.run.data["note"] == "ñandú"
    assert detail.run.data["usd"] == 0.12
    assert sorted(i.key for i in detail.items) == sorted(i.key for i in items)


async def test_runs_list_newest_first_up_to_the_limit(store: DynamoEvalStore):
    for n in range(3):
        await store.save_run(run(f"r{n}", START + timedelta(minutes=n)))

    runs = await store.list_runs(2)

    assert [r.run_id for r in runs] == ["r2", "r1"]


async def test_an_unknown_run_is_none(store: DynamoEvalStore):
    assert await store.get("nope") is None


async def test_every_item_expires_with_the_table(store: DynamoEvalStore, client: Any):
    await store.save_run(run("r1"))
    await store.add_items("r1", [EvalItemRecord("madrid/q1", {})])

    items = client.scan(TableName=TABLE)["Items"]

    assert len(items) == 2
    assert all("expires_at" in item for item in items)


async def test_no_trace_listing_returns_an_eval_run(
    store: DynamoEvalStore, client: Any
):
    await store.save_run(run("r1"))
    traces = DynamoTraceLog(client, TABLE)

    page = await traces.list_day(date(2026, 10, 25), TurnFilters(), None, 50)

    assert page.items == []


async def test_a_dynamodb_failure_is_provider_unavailable(store: DynamoEvalStore):
    error = ClientError({"Error": {"Code": "Throttling"}}, "PutItem")
    with (
        patch("ai_api.infrastructure.dynamo_eval.call", side_effect=error),
        pytest.raises(ProviderUnavailable, match="Throttling"),
    ):
        await store.save_run(run("r1"))


async def test_the_null_store_keeps_nothing():
    store = NullEvalStore()
    await store.save_run(run("r1"))

    assert await store.list_runs(5) == []
    assert await store.get("r1") is None


async def test_the_lock_admits_one_run_until_it_is_released_or_stale(
    store: DynamoEvalStore,
):
    stale = START - timedelta(minutes=15)

    assert await store.claim("r1", START, stale)
    assert not await store.claim("r2", START, stale)
    await store.release("r2")  # not the holder: nothing changes
    assert not await store.claim("r2", START, stale)
    await store.release("r1")
    assert await store.claim("r2", START, stale)
    later = START + timedelta(minutes=16)
    assert await store.claim("r3", later, later - timedelta(minutes=15))
