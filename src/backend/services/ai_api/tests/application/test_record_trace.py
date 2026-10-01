"""`application.record_trace.RecordTrace`: the trace is written once, before
the closing frame, whatever way the turn ends."""

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime

import pytest
from ai_api.application.record_trace import RecordTrace
from ai_api.application.tracing import TurnTracer, current_tracer
from ai_api.domain.models import ThreadSaved
from ai_api.domain.tracing import TurnTrace
from ai_api.schemas.planner_events import (
    OptionCard,
    PlannerEvent,
    Slot,
    done,
    error_event,
    options,
    patch,
    progress,
    put_activity,
    set_day_title,
    text,
)
from ai_api.testing import InMemoryTraceLog, InMemoryUsageStore
from travel_common.exceptions import ProviderUnavailable

DAY = datetime(2026, 9, 23, 10, 0, tzinfo=UTC)


def tracer() -> TurnTracer:
    return TurnTracer("planner", "/api/v1/ai/planner", "sub-1")


def card(card_id: str) -> OptionCard:
    return OptionCard.model_validate(
        {
            "id": card_id,
            "title": card_id.title(),
            "subtitle": None,
            "category": "see",
            "district": None,
            "why": "",
            "price_tier": None,
            "rating_text": None,
            "hours": None,
            "lat": None,
            "lon": None,
            "image_url": None,
            "image_credit": None,
            "source": "Wikivoyage",
            "source_url": "https://en.wikivoyage.org/wiki/Budapest",
            "license": "CC BY-SA 4.0",
            "deep_link": None,
        }
    )


class OrderedLog(InMemoryTraceLog):
    """Notes in `order` when the record happened among the events."""

    def __init__(self, order: list[str], fail_with: Exception | None = None) -> None:
        super().__init__(fail_with)
        self.order = order

    async def record(self, trace: TurnTrace) -> None:
        self.order.append("record")
        await super().record(trace)


async def stream(*events: PlannerEvent) -> AsyncIterator[PlannerEvent]:
    for event in events:
        yield event


async def collect(events: AsyncIterator, order: list[str]) -> list:
    out = []
    async for event in events:
        order.append(getattr(event, "type", "item"))
        out.append(event)
    return out


async def test_a_done_turn_is_recorded_before_done_is_yielded():
    order: list[str] = []
    log = OrderedLog(order)
    t = tracer()
    events = stream(
        text("Hola"),
        text(" mundo"),
        options("nb", "neighbourhood", "Pick one", [card("a"), card("b")]),
        patch(
            set_day_title(1, "Day 1"),
            put_activity(Slot(day=1, part="morning"), card("a")),
            put_activity(Slot(day=1, part="afternoon"), card("b")),
        ),
        done(),
    )

    out = await collect(RecordTrace(log, InMemoryUsageStore())(t, events), order)

    assert len(out) == 5
    assert order == ["text", "text", "options", "itinerary_patch", "record", "done"]
    [trace] = log.traces
    assert trace.status == "ok" and trace.error_code is None
    assert trace.events == {"text": 2, "options": 1, "itinerary_patch": 1, "done": 1}
    assert trace.ops == {"set_day_title": 1, "put_activity": 2}
    assert [m.summary for m in trace.timeline] == [
        "",
        "nb ×2",  # noqa: RUF001
        "set_day_title, put_activity ×2",  # noqa: RUF001
        "end",
    ]
    assert trace.timeline[0].count == 2
    assert trace.context.answer_text == "Hola mundo"
    assert trace.context.option_groups == [
        {"group_id": "nb", "kind": "neighbourhood", "card_ids": ["a", "b"]}
    ]
    assert trace.context.ops[1]["card"] == {"id": "a", "title": "A"}


async def test_progress_events_are_stamped_as_progress():
    """A `progress` event (ADR 0025) is its own mark, never a second `done`."""
    log = InMemoryTraceLog()
    events = stream(
        progress("open", "Opening the suitcase", []),
        progress("list", "Writing the list", ["Wikivoyage"]),
        text("Hola"),
        done(),
    )

    await collect(RecordTrace(log, InMemoryUsageStore())(tracer(), events), [])

    [trace] = log.traces
    assert trace.events == {"progress": 2, "text": 1, "done": 1}
    assert [(m.type, m.summary) for m in trace.timeline] == [
        ("progress", "open"),
        ("progress", "list"),
        ("text", ""),
        ("done", "end"),
    ]


async def test_a_stream_that_just_ends_is_recorded_ok():
    order: list[str] = []
    log = OrderedLog(order)

    await collect(
        RecordTrace(log, InMemoryUsageStore())(tracer(), stream(text("x"))), order
    )

    assert order == ["text", "record"]
    assert log.traces[0].status == "ok"


async def test_an_empty_stream_is_still_recorded():
    log = InMemoryTraceLog()

    assert (
        await collect(RecordTrace(log, InMemoryUsageStore())(tracer(), stream()), [])
        == []
    )
    assert [t.status for t in log.traces] == ["ok"]


async def test_an_error_event_is_recorded_as_an_error():
    order: list[str] = []
    log = OrderedLog(order)

    await collect(
        RecordTrace(log, InMemoryUsageStore())(
            tracer(), stream(text("x"), error_event("Boom", "SERVICE_UNAVAILABLE"))
        ),
        order,
    )

    assert order == ["text", "record", "error"]
    [trace] = log.traces
    assert trace.status == "error" and trace.error_code == "SERVICE_UNAVAILABLE"


async def test_a_raised_domain_error_is_recorded_then_propagates():
    log = InMemoryTraceLog()

    async def failing() -> AsyncIterator[PlannerEvent]:
        yield text("x")
        raise ProviderUnavailable("Vector store error")

    try:
        await collect(RecordTrace(log, InMemoryUsageStore())(tracer(), failing()), [])
    except ProviderUnavailable:
        pass
    else:
        raise AssertionError("the error must reach the SSE framer")

    [trace] = log.traces
    assert trace.status == "error" and trace.error_code == "SERVICE_UNAVAILABLE"
    assert trace.timeline[-1].type == "error"


async def test_a_client_that_goes_away_leaves_a_cancelled_trace():
    log = InMemoryTraceLog()
    events = RecordTrace(log, InMemoryUsageStore())(
        tracer(), stream(text("a"), text("b"), done())
    )

    first = await anext(events)
    await events.aclose()

    assert first.type == "text"
    [trace] = log.traces
    assert trace.status == "cancelled"


async def test_a_failing_log_never_breaks_the_stream():
    log = InMemoryTraceLog(fail_with=RuntimeError("dynamo down"))

    out = await collect(
        RecordTrace(log, InMemoryUsageStore())(tracer(), stream(text("x"), done())), []
    )

    assert [e.type for e in out] == ["text", "done"]
    assert log.traces == []


async def test_the_tracer_is_current_inside_the_wrapped_stream():
    t = tracer()
    seen: list[TurnTracer] = []

    async def use_case() -> AsyncIterator[PlannerEvent]:
        seen.append(current_tracer())
        yield done()

    await collect(
        RecordTrace(InMemoryTraceLog(), InMemoryUsageStore())(t, use_case()), []
    )

    assert seen == [t]


async def test_the_chat_stream_records_text_and_the_thread():
    log = InMemoryTraceLog()

    async def chat() -> AsyncIterator[str | ThreadSaved]:
        yield "Hola"
        yield " mundo"
        yield ThreadSaved("thread-1")

    out = [
        e async for e in RecordTrace(log, InMemoryUsageStore()).chat(tracer(), chat())
    ]

    assert out[-1] == ThreadSaved("thread-1")
    [trace] = log.traces
    assert trace.status == "ok"
    assert trace.events == {"text": 2, "thread": 1}
    assert trace.context.answer_text == "Hola mundo"


# ─── The day's token counter (ADR 0026) ─────────────────────────────────────


def spending(input_tokens: int = 100, output_tokens: int = 50) -> TurnTracer:
    """A tracer whose turn spent tokens on 2026-09-23 (UTC)."""
    t = TurnTracer("planner", "/api/v1/ai/planner", "sub-1", now=lambda: DAY)
    t.input_tokens = input_tokens
    t.output_tokens = output_tokens
    t.embed_tokens = 7
    return t


async def counted(usage: InMemoryUsageStore) -> tuple[int, int, int, int]:
    day = await usage.get("sub-1", date(2026, 9, 23))
    return day.input_tokens, day.output_tokens, day.embed_tokens, day.turns


async def test_an_ok_turn_adds_its_tokens_to_the_day():
    usage = InMemoryUsageStore()
    record = RecordTrace(InMemoryTraceLog(), usage)

    await collect(record(spending(), stream(text("x"), done())), [])
    await collect(record(spending(10, 5), stream(text("x"), done())), [])

    assert await counted(usage) == (110, 55, 14, 2)


async def test_an_error_turn_is_counted_too():
    usage = InMemoryUsageStore()
    record = RecordTrace(InMemoryTraceLog(), usage)

    async def failing() -> AsyncIterator[PlannerEvent]:
        yield text("x")
        raise ProviderUnavailable("bedrock down")

    await collect(
        record(spending(), stream(error_event("SERVICE_UNAVAILABLE", "x"))), []
    )
    with pytest.raises(ProviderUnavailable):
        await collect(record(spending(), failing()), [])

    assert await counted(usage) == (200, 100, 14, 2)


async def test_a_cancelled_turn_is_counted_too():
    usage = InMemoryUsageStore()
    events = RecordTrace(InMemoryTraceLog(), usage)(
        spending(), stream(text("a"), text("b"), done())
    )

    await anext(events)
    await events.aclose()

    assert await counted(usage) == (100, 50, 7, 1)


async def test_a_request_that_does_not_stream_is_counted():
    usage = InMemoryUsageStore()
    log = InMemoryTraceLog()

    await RecordTrace(log, usage).record(spending(0, 0), "ok", None)

    # A card detail spends embedding tokens only: kept, not counted.
    day = await usage.get("sub-1", date(2026, 9, 23))
    assert (day.embed_tokens, day.tokens, day.turns) == (7, 0, 1)
    assert len(log.traces) == 1


async def test_a_turn_without_tokens_adds_nothing():
    usage = InMemoryUsageStore()

    await collect(RecordTrace(InMemoryTraceLog(), usage)(tracer(), stream(done())), [])

    assert usage.days == {}


async def test_a_failing_usage_store_never_breaks_the_stream():
    log = InMemoryTraceLog()
    usage = FailingAdds()

    out = await collect(
        RecordTrace(log, usage)(spending(), stream(text("x"), done())), []
    )

    assert [e.type for e in out] == ["text", "done"]
    assert usage.attempts == 1
    assert len(log.traces) == 1  # the trace is written all the same


async def test_a_failing_log_still_counts_the_tokens():
    log = InMemoryTraceLog(fail_with=RuntimeError("dynamo down"))
    usage = InMemoryUsageStore()

    out = await collect(
        RecordTrace(log, usage)(spending(), stream(text("x"), done())), []
    )

    assert [e.type for e in out] == ["text", "done"]
    assert await counted(usage) == (100, 50, 7, 1)


class SlowLog(InMemoryTraceLog):
    """A trace write that is in flight until `release` is set."""

    def __init__(self) -> None:
        super().__init__()
        self.writing = asyncio.Event()
        self.release = asyncio.Event()

    async def record(self, trace: TurnTrace) -> None:
        self.writing.set()
        await self.release.wait()
        await super().record(trace)


@pytest.mark.parametrize(
    "events",
    [
        lambda: stream(text("x"), done()),
        lambda: stream(text("x"), error_event("Boom", "SERVICE_UNAVAILABLE")),
        lambda: stream(text("x")),
    ],
    ids=["done", "error-event", "end-of-stream"],
)
async def test_a_client_that_leaves_during_the_trace_write_is_still_counted(events):
    """The server cancels the streaming task on disconnect: neither write is
    lost, and the turn is counted once."""
    log = SlowLog()
    usage = InMemoryUsageStore()
    task = asyncio.create_task(
        collect(RecordTrace(log, usage)(spending(), events()), [])
    )

    await log.writing.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert await counted(usage) == (100, 50, 7, 1)
    log.release.set()
    for _ in range(5):
        await asyncio.sleep(0)
    assert len(log.traces) == 1  # the shielded write went through, once
    assert await counted(usage) == (100, 50, 7, 1)


async def test_the_usage_store_fake_fails_on_add_when_told_to():
    usage = InMemoryUsageStore(fail_with=RuntimeError("dynamo down"))

    with pytest.raises(RuntimeError):
        await usage.add(
            "sub-1", date(2026, 9, 23), input_tokens=1, output_tokens=1, embed_tokens=0
        )


class FailingAdds(InMemoryUsageStore):
    def __init__(self) -> None:
        super().__init__()
        self.attempts = 0

    async def add(self, subject: str, day: date, **tokens: int) -> None:
        self.attempts += 1
        raise RuntimeError("dynamo down")
