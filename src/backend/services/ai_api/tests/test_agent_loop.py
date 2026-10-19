"""The agent loop (TRA-290, ADR 0032 decision 5) with scripted model steps.

`FakeProvider(steps=...)` plays the model: each step is the text it streams
and the tool calls it makes. The toolbox is the real one over the Budapest
sample, so a step's calls run the real tools.
"""

import json
from collections.abc import AsyncIterator, Sequence
from datetime import date
from pathlib import Path
from uuid import uuid4

import pytest
from ai_api.application.agent.context import build_context
from ai_api.application.agent.loop import BUDGET_EXHAUSTED, ProseFilter, run_agent
from ai_api.application.agent.tools import Toolbox
from ai_api.application.plan_trip import PlanTrip, Turn, _read_turn
from ai_api.application.tracing import TurnTracer
from ai_api.domain.agent import AgentMessage, ToolCall
from ai_api.infrastructure.sse import sse_events
from ai_api.prompts import planner_text
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import (
    ItineraryPatchEvent,
    PlannerEvent,
    TextEvent,
    TripBrief,
)
from ai_api.testing import (
    BUDAPEST,
    FakeProvider,
    FakeRetriever,
    documents_from_corpus,
)
from travel_common.exceptions import ProviderUnavailable

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"
CORPUS = documents_from_corpus(FIXTURE)

ASTORIA = "wv:en:Budapest/Belváros#sleep:danubius-hotel-astoria"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
BASILICA = "wv:en:Budapest/Belváros#see:st-stephen-istvan-basilica"
RUDAS = "wv:en:Budapest/Víziváros#do:rudas-thermal-bath"


def request(
    message: str = "Remove the Rudas bath", language: str = "en"
) -> PlannerTurn:
    empty = {"morning": [], "afternoon": [], "evening": [], "night": []}
    brief = TripBrief.model_validate(
        {
            "destination": "Budapest",
            "origin": "Madrid",
            "start_date": date(2026, 10, 20),
            "end_date": date(2026, 10, 21),
            "nights": 1,
            "adults": 2,
            "children": 0,
            "budget_tier": 2,
            "interests": ["thermal_baths"],
            "pace": "balanced",
        }
    )
    days = [
        empty | {"morning": [PARLIAMENT], "afternoon": [BASILICA]},
        empty | {"afternoon": [RUDAS]},
    ]
    return PlannerTurn.model_validate(
        {
            "message": message,
            "action": None,
            "history": [],
            "brief": brief.model_dump(),
            "itinerary": {
                "stay_card_id": ASTORIA,
                "days": [{"day": i + 1, "slots": s} for i, s in enumerate(days)],
            },
            "exclude_card_ids": [],
            "trip_id": None,
            "session_id": None,
            "language": language,
        }
    )


class Run:
    def __init__(self, provider: FakeProvider, message: str, language: str) -> None:
        self.provider = provider
        self.plan = PlanTrip(
            provider,
            FakeRetriever(CORPUS),
            cities=[BUDAPEST],
            today=lambda: date(2026, 9, 18),
            agent_enabled=True,
        )
        self.turn: Turn = _read_turn(request(message, language))
        self.tracer = TurnTracer("planner", "/planner", "1")
        self.turn.tracer = self.tracer
        self.phases: list[str] = []
        self.turn.on_phase = lambda step, _days: self.phases.append(step)

    async def events(
        self, *, max_steps: int = 6, max_tool_calls: int = 12
    ) -> AsyncIterator[PlannerEvent]:
        context = await build_context(self.turn, self.plan)
        self.toolbox = Toolbox(context)
        async for event in run_agent(
            self.turn,
            self.provider,
            self.toolbox,
            system=context.system,
            messages=context.messages,
            max_steps=max_steps,
            max_tool_calls=max_tool_calls,
        ):
            yield event


async def agent(
    steps: Sequence[Sequence[object]],
    *,
    message: str = "Remove the Rudas bath",
    language: str = "en",
    **limits: int,
) -> tuple[list[PlannerEvent], Run]:
    run = Run(FakeProvider(steps=steps), message, language)  # type: ignore[arg-type]
    return [e async for e in run.events(**limits)], run


def use(name: str, **arguments: object) -> ToolCall:
    """A scripted call; `tool_call` would take an `id` argument as the call's."""
    return ToolCall(id=f"call-{uuid4().hex[:6]}", name=name, arguments=arguments)


def joined(events: Sequence[PlannerEvent]) -> str:
    return "".join(e.delta for e in events if isinstance(e, TextEvent))


def results_of(message: AgentMessage) -> list[dict]:
    return [json.loads(r.content) for r in message.tool_results]


async def test_a_step_without_tools_is_the_answer():
    events, run = await agent([["Rudas is ", "a Turkish bath."]])

    assert joined(events) == "Rudas is a Turkish bath."
    assert len(run.provider.conversations) == 1
    system, messages, tools = run.provider.conversations[0]
    assert "Kiri" in system[0]
    assert [m.role for m in messages] == ["user"]
    assert messages[0].text == "Remove the Rudas bath"
    assert {"search_places", "add_activity", "redraft_day"} <= {t.name for t in tools}
    assert run.phases[-1] == "zip"


async def test_one_tool_then_the_answer():
    events, run = await agent(
        [
            [use("remove_activity", id=RUDAS, day=2)],
            ["Done: Rudas is off day 2."],
        ]
    )

    ops = [op for e in events if isinstance(e, ItineraryPatchEvent) for op in e.ops]
    assert [op.op for op in ops] == ["remove_activity"]
    assert joined(events) == "Done: Rudas is off day 2."
    _, messages, _ = run.provider.conversations[1]
    assistant, results = messages[-2], messages[-1]
    assert assistant.role == "assistant" and assistant.tool_calls[0].name == (
        "remove_activity"
    )
    assert results.role == "user"
    assert results.tool_results[0].call_id == assistant.tool_calls[0].id
    assert results_of(results)[0]["removed"]["id"] == RUDAS


async def test_two_calls_in_one_step_run_in_order():
    events, run = await agent(
        [
            [
                "On it. ",
                use("remove_activity", id=RUDAS, day=2),
                use(
                    "move_activity",
                    id=BASILICA,
                    from_day=1,
                    to_day=2,
                    to_part="afternoon",
                ),
            ],
            ["Moved the Basilica to day 2."],
        ]
    )

    patches = [e for e in events if isinstance(e, ItineraryPatchEvent)]
    assert [[op.op for op in p.ops] for p in patches[:2]] == [
        ["remove_activity"],
        ["remove_activity", "put_activity"],
    ]
    _, messages, _ = run.provider.conversations[1]
    assert messages[-2].text == "On it. "
    first, second = results_of(messages[-1])
    assert "removed" in first and "moved" in second


async def test_an_unknown_tool_is_an_error_the_model_reads():
    events, run = await agent([[use("book_flight", to="Rome")], ["Sorry."]])

    _, messages, _ = run.provider.conversations[1]
    [result] = messages[-1].tool_results
    assert result.is_error
    assert "unknown tool" in json.loads(result.content)["error"]
    assert joined(events) == "Sorry."


async def test_invalid_arguments_are_an_error_the_model_reads():
    _, run = await agent(
        [[use("add_activity", id=RUDAS, day="two", part="noon")], ["Hm."]]
    )

    _, messages, _ = run.provider.conversations[1]
    [result] = messages[-1].tool_results
    content = json.loads(result.content)
    assert result.is_error and content["error"] == "invalid arguments"
    assert any(d.startswith("day") for d in content["details"])


async def test_arguments_that_were_not_json_are_an_error():
    _, run = await agent([[use("search_places", _raw="{query: baths")], ["Hm."]])

    _, messages, _ = run.provider.conversations[1]
    assert messages[-1].tool_results[0].is_error


async def test_past_the_step_budget_one_last_step_must_answer():
    search = {"query": "bath", "kind": "sight"}
    events, run = await agent(
        [
            [use("search_places", **search)],
            [use("search_places", **search)],
            [use("search_places", **search)],
        ],
        max_steps=2,
    )

    assert len(run.provider.conversations) == 3
    _, messages, _ = run.provider.conversations[2]
    [result] = messages[-1].tool_results
    assert result.is_error and result.content == BUDGET_EXHAUSTED
    assert joined(events) == planner_text("en", "agent_budget")
    tools = [s for s in run.tracer.spans if s.kind == "tool"]
    assert len(tools) == 1  # only the first step's call ran


async def test_a_last_step_that_answers_ends_the_turn_normally():
    events, _ = await agent(
        [
            [use("list_districts")],
            [use("list_districts")],
            ["Here you go."],
        ],
        max_steps=2,
        language="es",
        message="¿Qué barrios hay?",
    )

    assert joined(events) == "Here you go."


async def test_past_the_call_budget_further_calls_are_refused():
    events, run = await agent(
        [
            [use("list_districts"), use("list_districts")],
            ["Done."],
        ],
        max_tool_calls=1,
    )

    _, messages, _ = run.provider.conversations[1]
    ran, refused = messages[-1].tool_results
    assert not ran.is_error
    assert refused.is_error and refused.content == BUDGET_EXHAUSTED
    assert joined(events) == "Done."


class DownProvider(FakeProvider):
    async def converse(self, system, messages, tools, *, usage=None):
        raise ProviderUnavailable("AI provider error")
        yield  # pragma: no cover


async def test_an_unavailable_provider_ends_the_stream_with_an_error_event():
    run = Run(DownProvider(), "Remove the bath", "en")

    framed = [chunk async for chunk in sse_events(run.events())]

    errors = [json.loads(c[6:]) for c in framed if '"type":"error"' in c]
    assert errors and errors[0]["error_code"] == "SERVICE_UNAVAILABLE"


async def test_every_step_and_every_tool_is_a_span():
    _, run = await agent(
        [
            [use("remove_activity", id=RUDAS, day=2)],
            ["Removed."],
        ]
    )

    llm = [s for s in run.tracer.spans if s.kind == "llm"]
    assert [s.name for s in llm] == ["agent:1", "agent:2"]
    assert all(s.payload["operation"] == "agent" for s in llm)
    assert llm[0].payload["tool_calls"] == ["remove_activity"]
    assert llm[0].payload["stop_reason"] == "tool_use"
    assert llm[1].payload["stop_reason"] == "end_turn"
    assert llm[0].payload["input"] == "Remove the Rudas bath"
    assert llm[0].payload["prompt_version"]
    [tool] = [s for s in run.tracer.spans if s.kind == "tool"]
    assert tool.name == "tool:remove_activity" and tool.payload["status"] == "ok"
    # The fake model reports 3 + 2 tokens a step: both steps are counted.
    assert (run.tracer.input_tokens, run.tracer.output_tokens) == (6, 4)


async def test_a_tool_announces_its_phase_and_the_answer_zips():
    _, run = await agent(
        [[use("search_places", query="bath", kind="sight")], ["Found some."]]
    )

    assert run.phases[0] == "wardrobe" and run.phases[-1] == "zip"


async def test_the_next_steps_words_are_a_new_paragraph():
    events, _ = await agent(
        [["Looking for baths.", use("list_districts")], ["Here they are."]]
    )

    assert joined(events) == "Looking for baths.\n\nHere they are."


async def test_text_after_a_tools_own_sentence_starts_apart():
    events, _ = await agent(
        [[use("offer_stays", mode="other_hotels")], ["Pick one you like."]]
    )

    texts = [e.delta for e in events if isinstance(e, TextEvent)]
    assert texts[-1] == "\n\nPick one you like."


# ─── Prices never reach the page ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "deltas",
    [
        ["Dinner is about 12.50 €. Enjoy."],
        ["The bath costs 1.500 Ft on weekdays.\n"],
        ["The bath costs 12", ",50", " €", " a day. Lovely."],
        ["Entry is € ", "12 for adults."],
    ],
)
async def test_streamed_prices_are_stripped_even_split_across_deltas(deltas):
    events, run = await agent([deltas])

    answer = joined(events)
    assert "€" not in answer.replace("(price not shown)", "")
    assert "Ft" not in answer
    assert "(price not shown)" in answer
    stripped = [s for s in run.tracer.spans if s.name == "strip_prices"]
    assert stripped and stripped[0].payload["details"]["stripped"] >= 1


def test_the_prose_filter_cuts_at_sentences_and_keeps_prices_whole():
    prose = ProseFilter()

    first = prose.feed("It is lovely. It costs 12")
    second = prose.feed(" € a day.")
    rest = prose.flush()

    assert first == ["It is lovely. "]
    assert second == [] and rest == ["It costs (price not shown) a day."]


def test_the_prose_filter_flushes_a_long_run_at_a_safe_space():
    prose = ProseFilter()

    pieces = prose.feed("word " * 50 + "costs 12")

    assert pieces and not pieces[0].endswith("12")
    assert "12" not in "".join(pieces)
    assert prose.flush() == ["costs 12"]
