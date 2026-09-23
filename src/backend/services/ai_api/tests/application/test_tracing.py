"""`application.tracing`: spans, nesting, used marks, caps and the null tracer."""

import asyncio

import pytest
from ai_api.application.structured import complete_json
from ai_api.application.tracing import (
    NullTracer,
    TurnTracer,
    clip,
    current_tracer,
    traced_llm_stream,
    use_tracer,
)
from ai_api.domain.models import Document, Message, Usage
from ai_api.domain.tracing import MAX_EVENT_MARKS, MAX_SOURCES, MAX_SPANS
from ai_api.testing import FakeProvider
from pydantic import BaseModel
from travel_common.exceptions import ProviderUnavailable


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now

    def advance(self, ms: int) -> None:
        self.now += ms / 1000


def doc(doc_id: str, distance: float | None = 0.25) -> Document:
    return Document(
        id=doc_id,
        content="text",
        metadata={
            "name": f"Place {doc_id}",
            "category": "see",
            "district": "Belváros",
            "distance": distance,
        },
    )


def tracer(clock: FakeClock | None = None) -> TurnTracer:
    return TurnTracer(
        "planner", "/api/v1/ai/planner", "sub-1", clock=clock or FakeClock()
    )


async def test_spans_nest_and_carry_their_parent():
    t = tracer()

    async with t.span("chain", "outer") as outer:
        async with t.span("retriever", "inner") as inner:
            pass
        async with t.span("llm", "sibling") as sibling:
            pass
    async with t.span("tool", "after") as after:
        pass

    assert outer.parent_seq is None
    assert inner.parent_seq == outer.seq
    assert sibling.parent_seq == outer.seq
    assert after.parent_seq is None
    assert [s.seq for s in t.spans] == [1, 2, 3, 4]


async def test_spans_in_gathered_tasks_keep_their_parent():
    t = tracer()

    async def child(name: str) -> int:
        async with t.span("retriever", name) as span:
            await asyncio.sleep(0)
            return span.parent_seq or -1

    async with t.span("chain", "parent") as parent:
        parents = await asyncio.gather(child("a"), child("b"))

    assert parents == [parent.seq, parent.seq]


async def test_times_are_relative_to_the_start_of_the_turn():
    clock = FakeClock()
    t = tracer(clock)
    clock.advance(40)

    async with t.span("llm", "call") as span:
        clock.advance(250)

    assert span.t0_ms == 40
    assert span.dur_ms == 250


async def test_every_payload_key_is_present_for_its_kind():
    t = tracer()

    async with t.span("llm", "call", model="m") as llm:
        pass
    async with t.span("retriever", "search") as retriever:
        pass

    assert llm.payload["model"] == "m"
    assert llm.payload["validation_error"] is None
    assert "ttfc_ms" in llm.payload and "picked_ids" in llm.payload
    assert set(retriever.payload) >= {"purpose", "query", "filters", "k", "no_hit"}


async def test_a_failing_block_marks_the_span_and_propagates():
    t = tracer()

    with pytest.raises(ProviderUnavailable):
        async with t.span("retriever", "search"):
            raise ProviderUnavailable("Vector store error")

    [span] = t.spans
    assert span.level == "error"
    assert span.message is not None and "Vector store error" in span.message


async def test_phases_stamp_the_spans_opened_after_them():
    t = tracer()

    async with t.span("chain", "read_turn") as first:
        pass
    t.phase("fold")
    async with t.span("llm", "pick") as second:
        pass

    assert (first.phase, second.phase) == ("open", "fold")


async def test_mark_used_marks_spans_and_sources_and_counts_each_id_once():
    t = tracer()
    async with t.span("retriever", "a") as a:
        t.retrieved(a, [doc("x"), doc("y")])
    async with t.span("retriever", "b") as b:
        t.retrieved(b, [doc("x"), doc("z", None)])

    t.mark_used(["x", "x", "unknown"])
    t.mark_used(["x"])
    trace = t.finish("ok")

    assert [r.used for r in a.results] == [True, False]
    assert [r.used for r in b.results] == [True, False]
    assert [(s.doc_id, s.used) for s in trace.sources] == [
        ("x", True),
        ("y", False),
        ("x", True),
        ("z", False),
    ]
    assert trace.docs_used == 1
    assert trace.docs_retrieved == 4 and trace.retrievals == 2
    assert a.results[0].rank == 1 and a.results[0].distance == 0.25
    assert a.results[0].title == "Place x" and a.results[0].district == "Belváros"


async def test_an_empty_retrieval_is_a_no_hit():
    t = tracer()
    async with t.span("retriever", "a") as span:
        t.retrieved(span, [])

    assert span.payload["no_hit"] is True and span.payload["n_results"] == 0


async def test_note_picks_fills_the_last_model_call_and_counts_dropped_ids():
    t = tracer()
    async with t.span("retriever", "a") as a:
        t.retrieved(a, [doc("x"), doc("y")])
    async with t.span("llm", "pick") as llm:
        pass

    t.note_picks(["x"], ["made-up"])
    trace = t.finish("ok")

    assert llm.payload["picked_ids"] == ["x"]
    assert llm.payload["dropped_ids"] == ["made-up"]
    assert trace.dropped_ids == 1 and trace.docs_used == 1


def test_clip_cuts_on_a_utf8_boundary():
    text = "ab€€"  # € is three bytes

    assert clip(text, 4) == ("ab", True)
    assert clip(text, 5) == ("ab€", True)
    assert clip(text, 8) == ("ab€€", False)
    assert clip(None, 4) == ("", False)


async def test_caps_drop_the_excess_and_mark_the_trace_truncated():
    t = tracer()
    for n in range(MAX_SPANS + 5):
        async with t.span("chain", f"s{n}"):
            pass
    async with t.span("retriever", "wide") as span:
        t.retrieved(span, [doc(str(n)) for n in range(MAX_SOURCES + 3)])
    for n in range(MAX_EVENT_MARKS + 3):
        t.event("brief" if n % 2 else "options", "", 1)

    trace = t.finish("ok")

    assert len(trace.spans) == MAX_SPANS
    assert len(trace.sources) == MAX_SOURCES
    assert len(trace.timeline) == MAX_EVENT_MARKS
    assert trace.truncated is True
    # Counters still see what the caps dropped.
    assert trace.retrievals == 1 and trace.docs_retrieved == MAX_SOURCES + 3


async def test_consecutive_text_events_collapse_into_one_mark():
    t = tracer()
    t.event("text", "", 3)
    t.event("text", "", 4)
    t.event("options", "nb ×3", 10)  # noqa: RUF001
    t.event("text", "", 1)

    trace = t.finish("ok")

    assert [(m.type, m.count, m.bytes) for m in trace.timeline] == [
        ("text", 2, 7),
        ("options", 1, 10),
        ("text", 1, 1),
    ]
    assert trace.events == {"text": 3, "options": 1}
    assert trace.first_event_ms == 0


async def test_finish_sums_the_model_calls_and_prices_them():
    t = tracer()
    async with t.span("llm", "a", model="eu.anthropic.claude-haiku-4-5-v1") as a:
        a.payload.update(input_tokens=1000, output_tokens=200)
    async with t.span("llm", "b") as b:
        b.payload.update(input_tokens=500, output_tokens=None, repaired=True)
    t.set_request(message="5 days in Budapest")
    t.answer("Great ")
    t.answer("choice")

    trace = t.finish("ok")

    assert trace.llm_calls == 2 and trace.repairs == 1
    assert (trace.input_tokens, trace.output_tokens) == (1500, 200)
    assert trace.model == "eu.anthropic.claude-haiku-4-5-v1"
    assert trace.cost_usd == pytest.approx((1500 * 1.0 + 200 * 5.0) / 1_000_000)
    assert trace.question_preview == "5 days in Budapest"
    assert trace.answer_preview == "Great choice"
    assert trace.context.answer_text == "Great choice"


async def test_the_null_tracer_records_nothing():
    t = NullTracer()

    async with t.span("llm", "call") as span:
        span.payload["model"] = "m"
    t.retrieved(span, [doc("x")])
    t.mark_used(["x"])
    t.event("text", "", 3)
    trace = t.finish("ok")

    assert trace.spans == [] and trace.sources == [] and trace.timeline == []
    assert trace.llm_calls == 0 and trace.docs_used == 0


async def test_current_tracer_is_null_outside_a_request():
    assert isinstance(current_tracer(), NullTracer)
    t = tracer()
    with use_tracer(t):
        assert current_tracer() is t
    assert isinstance(current_tracer(), NullTracer)


async def test_traced_llm_stream_records_tokens_ttfc_and_output():
    t = tracer()
    provider = FakeProvider(deltas=["Hola", " mundo"])
    usage = Usage()

    parts = [
        delta
        async for delta in traced_llm_stream(
            provider,
            [Message("system", "s"), Message("user", "hello")],
            name="chat",
            tracer=t,
            template="TEMPLATE",
            usage=usage,
        )
    ]

    [span] = t.spans
    assert parts == ["Hola", " mundo"]
    assert span.kind == "llm" and span.name == "chat"
    assert span.payload["operation"] == "chat" and span.payload["provider"] == "fake"
    assert span.payload["input"] == "hello"
    assert span.payload["output"] == "Hola mundo"
    assert span.payload["ttfc_ms"] is not None
    assert (span.payload["input_tokens"], span.payload["output_tokens"]) == (3, 2)
    assert len(span.payload["prompt_version"]) == 12
    assert usage.model == "fake-model"


class Answer(BaseModel):
    value: int


async def test_complete_json_records_a_repair():
    t = tracer()
    provider = FakeProvider(replies=["not json", '{"value": 3}'])

    answer = await complete_json(
        provider, [Message("user", "q")], Answer, name="extract", tracer=t
    )

    [span] = t.spans
    assert answer.value == 3
    assert span.payload["schema"] == "Answer"
    assert span.payload["operation"] == "structured"
    assert span.payload["attempts"] == 2 and span.payload["repaired"] is True
    assert span.payload["validation_error"]
    # Tokens of both attempts.
    assert (span.payload["input_tokens"], span.payload["output_tokens"]) == (6, 4)
    assert t.finish("ok").repairs == 1


async def test_complete_json_that_fails_twice_marks_the_span():
    t = tracer()
    provider = FakeProvider(replies=["nope", "still nope"])

    with pytest.raises(ProviderUnavailable):
        await complete_json(
            provider, [Message("user", "q")], Answer, name="extract", tracer=t
        )

    [span] = t.spans
    assert span.level == "error" and span.payload["repaired"] is False
    assert span.payload["attempts"] == 2
