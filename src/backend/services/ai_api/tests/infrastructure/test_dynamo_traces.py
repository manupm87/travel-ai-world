"""`infrastructure.dynamo_traces.DynamoTraceLog` against moto's DynamoDB."""

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from ai_api.application.tracing import TurnTracer
from ai_api.domain.models import Document
from ai_api.domain.tracing import RetrievedDoc, Span, TurnFilters, TurnTrace
from ai_api.infrastructure.dynamo_traces import DynamoTraceLog, TraceWriteFailed, spec
from ai_api.testing import InMemoryTraceLog, make_trace
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError
from travel_common.dynamodb import dynamodb_client, ensure_table
from travel_common.exceptions import BadRequest, ProviderUnavailable
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


# ─── Reads (TRA-221) ────────────────────────────────────────────────────────


def seeded_traces() -> list[TurnTrace]:
    """Three turns on two days, two subjects, two sessions."""
    return [
        make_trace(
            turn_id="a",
            ts=datetime(2026, 9, 22, 9, 0, tzinfo=UTC),
            subject="sub-1",
            session_id="sess-1",
        ),
        make_trace(
            turn_id="b",
            ts=datetime(2026, 9, 23, 9, 0, tzinfo=UTC),
            subject="sub-1",
            session_id="sess-1",
            status="error",
            error_code="SERVICE_UNAVAILABLE",
            cost_usd=None,
            spans=[
                Span(
                    seq=2,
                    parent_seq=1,
                    kind="retriever",
                    name="search:see",
                    phase="wardrobe",
                    t0_ms=10,
                    dur_ms=40,
                    level="warning",
                    message="widened",
                    payload={"k": 5, "filters": {"city": "budapest"}, "query": None},
                    results=[
                        RetrievedDoc(
                            doc_id="doc-9",
                            title=None,
                            category="see",
                            district="V",
                            distance=0.375,
                            rank=1,
                            used=False,
                        )
                    ],
                ),
                Span(
                    seq=1,
                    parent_seq=None,
                    kind="chain",
                    name="read",
                    phase="open",
                    t0_ms=0,
                ),
            ],
        ),
        make_trace(
            turn_id="c",
            ts=datetime(2026, 9, 23, 10, 0, tzinfo=UTC),
            kind="card",
            subject="sub-2",
            session_id="sess-2",
            city="bologna",
        ),
    ]


@pytest.fixture
async def log(client: Any) -> DynamoTraceLog:
    await ensure_table(client, spec(TABLE))
    traces = DynamoTraceLog(client, TABLE)
    for trace in seeded_traces():
        await traces.record(trace)
    return traces


def turn_ids(page: Any) -> list[str]:
    return [turn.turn_id for turn in page.items]


async def test_a_day_lists_newest_first_and_filters(log: DynamoTraceLog):
    day = date(2026, 9, 23)

    every = await log.list_day(day, TurnFilters(), None, 50)
    cards = await log.list_day(day, TurnFilters(kind="card"), None, 50)
    errors = await log.list_day(
        day, TurnFilters(status="error", city="budapest"), None, 50
    )

    assert turn_ids(every) == ["c", "b"] and every.next_cursor is None
    assert turn_ids(cards) == ["c"]
    assert turn_ids(errors) == ["b"]
    assert every.items[0].day == "2026-09-23"


async def test_a_cursor_walks_a_day(log: DynamoTraceLog):
    day = date(2026, 9, 23)

    first = await log.list_day(day, TurnFilters(), None, 1)
    assert first.next_cursor is not None
    second = await log.list_day(day, TurnFilters(), first.next_cursor, 1)

    assert turn_ids(first) == ["c"] and turn_ids(second) == ["b"]


async def test_a_filtered_page_queries_until_it_is_full(log: DynamoTraceLog):
    page = await log.list_day(date(2026, 9, 23), TurnFilters(kind="planner"), None, 1)

    assert turn_ids(page) == ["b"]


async def test_a_user_lists_newest_first(log: DynamoTraceLog):
    page = await log.list_subject("sub-1", TurnFilters(), None, 50)
    walked = await log.list_subject("sub-1", TurnFilters(), None, 1)
    rest = await log.list_subject("sub-1", TurnFilters(), walked.next_cursor, 1)

    assert turn_ids(page) == ["b", "a"]
    assert turn_ids(walked) + turn_ids(rest) == ["b", "a"]


async def test_a_session_lists_oldest_first(log: DynamoTraceLog):
    page = await log.list_session("sess-1", None, 50)

    assert turn_ids(page) == ["a", "b"]


async def test_a_turn_round_trips_every_field(log: DynamoTraceLog):
    trace = seeded_traces()[1]
    expected = InMemoryTraceLog()
    expected.traces.append(trace)

    detail = await log.get("b")

    assert detail is not None
    assert detail == await expected.get("b")
    assert detail.summary.cost_usd is None
    assert [span.seq for span in detail.spans] == [1, 2]
    retrieval = detail.spans[1]
    assert retrieval.payload == {"k": 5, "filters": {"city": "budapest"}, "query": None}
    assert retrieval.results[0].distance == 0.375
    assert isinstance(detail.summary.latency_ms, int)


async def test_an_unknown_turn_is_none(log: DynamoTraceLog):
    assert await log.get("nope") is None


async def test_a_range_yields_every_summary_of_every_day(log: DynamoTraceLog):
    turns = [t async for t in log.iter_range(date(2026, 9, 21), date(2026, 9, 23))]

    assert sorted(t.turn_id for t in turns) == ["a", "b", "c"]


@pytest.mark.parametrize(
    "cursor",
    [
        "not base64!",
        "bm90IGpzb24",
        "eyJQSyI6IHsiUyI6ICJ4In19",
    ],  # garbage, text, wrong keys
)
async def test_a_malformed_cursor_is_bad_request(log: DynamoTraceLog, cursor: str):
    with pytest.raises(BadRequest):
        await log.list_day(date(2026, 9, 23), TurnFilters(), cursor, 10)


class Throttled:
    """A client whose every read is refused."""

    def query(self, **kwargs: Any) -> Any:
        raise ClientError(
            {"Error": {"Code": "ProvisionedThroughputExceededException"}}, "Query"
        )


async def test_a_dynamodb_failure_is_provider_unavailable():
    log = DynamoTraceLog(Throttled(), TABLE)

    with pytest.raises(ProviderUnavailable, match="ProvisionedThroughput"):
        await log.list_session("sess-1", None, 10)
