"""`infrastructure.dynamo_traces.DynamoTraceLog` against moto's DynamoDB."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from ai_api.application.tracing import TurnTracer
from ai_api.domain.models import Document
from ai_api.domain.tracing import TurnTrace
from ai_api.infrastructure.dynamo_traces import DynamoTraceLog, TraceWriteFailed, spec
from boto3.dynamodb.types import TypeDeserializer
from travel_common.dynamodb import dynamodb_client, ensure_table
from travel_common.testing import mock_dynamodb

TABLE = "test-interactions"
TS = datetime(2026, 9, 23, 10, 15, 30, 123456, tzinfo=UTC)

_deserializer = TypeDeserializer()


@pytest.fixture
def client() -> Iterator[Any]:
    with mock_dynamodb():
        yield dynamodb_client("", "eu-west-1")


async def build_trace(*, session_id: str | None, spans: int = 2) -> TurnTrace:
    tracer = TurnTracer("planner", "/api/v1/ai/planner", "sub-1", now=lambda: TS)
    tracer.turn_id = "turn1"
    tracer.session_id = session_id
    tracer.set_request(message="5 days in Budapest", history=[("user", "hi")])
    async with tracer.span("retriever", "search:neighbourhoods") as span:
        tracer.retrieved(
            span,
            [
                Document(
                    id="doc-1",
                    content="x",
                    metadata={"name": "Belváros", "distance": 0.123},
                )
            ],
        )
    for n in range(spans - 1):
        async with tracer.span("llm", f"call{n}", model=None) as llm:
            llm.payload["input_tokens"] = 10
    tracer.mark_used(["doc-1"])
    tracer.event("text", "", 12)
    return tracer.finish("ok")


def rows(client: Any) -> dict[tuple[str, str], dict[str, Any]]:
    items = client.scan(TableName=TABLE)["Items"]
    return {
        (item["PK"]["S"], item["SK"]["S"]): {
            key: _deserializer.deserialize(value) for key, value in item.items()
        }
        for item in items
    }


async def test_every_item_has_its_keys_and_expiry(client: Any):
    await ensure_table(client, spec(TABLE))
    trace = await build_trace(session_id="sess-1")

    await DynamoTraceLog(client, TABLE, ttl_days=90).record(trace)

    stored = rows(client)
    summary_key = ("DAY#2026-09-23", "2026-09-23T10:15:30.123456+00:00#turn1")
    assert set(stored) == {
        summary_key,
        ("TURN#turn1", "CONTEXT"),
        ("TURN#turn1", "EVENTS"),
        ("TURN#turn1", "SPAN#0001"),
        ("TURN#turn1", "SPAN#0002"),
    }
    expires = int((TS + timedelta(days=90)).timestamp())
    assert all(item["expires_at"] == expires for item in stored.values())

    summary = stored[summary_key]
    assert summary["GSI1PK"] == "SUBJECT#sub-1"
    assert summary["GSI1SK"] == "2026-09-23T10:15:30.123456+00:00"
    assert summary["GSI2PK"] == "SESSION#sess-1"
    assert summary["kind"] == "planner" and summary["status"] == "ok"
    assert summary["docs_used"] == 1 and summary["input_tokens"] == 10
    # Unknown values are kept as NULL, not left out.
    assert "cost_usd" in summary and summary["cost_usd"] is None
    [source] = summary["sources"]
    assert source["distance"] == Decimal("0.123") and source["used"] is True

    context = stored[("TURN#turn1", "CONTEXT")]
    assert context["message"] == "5 days in Budapest"
    assert context["summary_sk"] == summary_key[1] and context["day"] == "2026-09-23"
    assert context["history"] == [{"role": "user", "content": "hi"}]

    span = stored[("TURN#turn1", "SPAN#0001")]
    assert span["kind"] == "retriever" and span["results"][0]["doc_id"] == "doc-1"
    llm = stored[("TURN#turn1", "SPAN#0002")]
    assert "model" in llm["payload"] and llm["payload"]["model"] is None

    events = stored[("TURN#turn1", "EVENTS")]
    assert events["timeline"][0]["type"] == "text"


async def test_a_turn_without_a_session_has_no_gsi2(client: Any):
    await ensure_table(client, spec(TABLE))
    trace = await build_trace(session_id=None)

    await DynamoTraceLog(client, TABLE).record(trace)

    summary = next(v for (pk, _), v in rows(client).items() if pk.startswith("DAY#"))
    assert "GSI2PK" not in summary and "GSI2SK" not in summary


async def test_more_than_25_items_are_written_in_batches(client: Any):
    await ensure_table(client, spec(TABLE))
    trace = await build_trace(session_id="s", spans=40)
    calls: list[int] = []
    original = client.batch_write_item

    def counting(**kwargs: Any) -> Any:
        calls.append(sum(len(v) for v in kwargs["RequestItems"].values()))
        return original(**kwargs)

    client.batch_write_item = counting
    try:
        await DynamoTraceLog(client, TABLE).record(trace)
    finally:
        client.batch_write_item = original

    assert calls == [25, 18]  # summary + context + events + 40 spans
    assert len(rows(client)) == 43


class Unprocessing:
    """A client that never processes anything."""

    def __init__(self) -> None:
        self.calls = 0

    def batch_write_item(self, **kwargs: Any) -> Any:
        self.calls += 1
        return {"UnprocessedItems": kwargs["RequestItems"]}


async def test_unprocessed_items_are_retried_then_raise():
    trace = await build_trace(session_id=None)
    fake = Unprocessing()

    with pytest.raises(TraceWriteFailed):
        await DynamoTraceLog(fake, TABLE, backoff=0).record(trace)

    assert fake.calls == 4  # the first try and three retries
