"""`application.record_trace.RecordTrace`: the trace is written once, before
the closing frame, whatever way the turn ends."""

from collections.abc import AsyncIterator

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
    put_activity,
    set_day_title,
    text,
)
from ai_api.testing import InMemoryTraceLog
from travel_common.exceptions import ProviderUnavailable


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

    out = await collect(RecordTrace(log)(t, events), order)

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


async def test_a_stream_that_just_ends_is_recorded_ok():
    order: list[str] = []
    log = OrderedLog(order)

    await collect(RecordTrace(log)(tracer(), stream(text("x"))), order)

    assert order == ["text", "record"]
    assert log.traces[0].status == "ok"


async def test_an_empty_stream_is_still_recorded():
    log = InMemoryTraceLog()

    assert await collect(RecordTrace(log)(tracer(), stream()), []) == []
    assert [t.status for t in log.traces] == ["ok"]


async def test_an_error_event_is_recorded_as_an_error():
    order: list[str] = []
    log = OrderedLog(order)

    await collect(
        RecordTrace(log)(
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
        await collect(RecordTrace(log)(tracer(), failing()), [])
    except ProviderUnavailable:
        pass
    else:
        raise AssertionError("the error must reach the SSE framer")

    [trace] = log.traces
    assert trace.status == "error" and trace.error_code == "SERVICE_UNAVAILABLE"
    assert trace.timeline[-1].type == "error"


async def test_a_client_that_goes_away_leaves_a_cancelled_trace():
    log = InMemoryTraceLog()
    events = RecordTrace(log)(tracer(), stream(text("a"), text("b"), done()))

    first = await anext(events)
    await events.aclose()

    assert first.type == "text"
    [trace] = log.traces
    assert trace.status == "cancelled"


async def test_a_failing_log_never_breaks_the_stream():
    log = InMemoryTraceLog(fail_with=RuntimeError("dynamo down"))

    out = await collect(RecordTrace(log)(tracer(), stream(text("x"), done())), [])

    assert [e.type for e in out] == ["text", "done"]
    assert log.traces == []


async def test_the_tracer_is_current_inside_the_wrapped_stream():
    t = tracer()
    seen: list[TurnTracer] = []

    async def use_case() -> AsyncIterator[PlannerEvent]:
        seen.append(current_tracer())
        yield done()

    await collect(RecordTrace(InMemoryTraceLog())(t, use_case()), [])

    assert seen == [t]


async def test_the_chat_stream_records_text_and_the_thread():
    log = InMemoryTraceLog()

    async def chat() -> AsyncIterator[str | ThreadSaved]:
        yield "Hola"
        yield " mundo"
        yield ThreadSaved("thread-1")

    out = [e async for e in RecordTrace(log).chat(tracer(), chat())]

    assert out[-1] == ThreadSaved("thread-1")
    [trace] = log.traces
    assert trace.status == "ok"
    assert trace.events == {"text": 2, "thread": 1}
    assert trace.context.answer_text == "Hola mundo"
