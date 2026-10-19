"""The agent loop: model steps and tool calls until Kiri answers (ADR 0032).

Each step is one `traced_converse` call. Its text goes to the traveller as it
comes — through `ProseFilter`, so a price never reaches the page — and its
tool calls run one at a time, in order, each yielding its planner events at
once. The loop ends with the first step that calls no tool. Past the budget
(`max_steps` steps, `max_tool_calls` calls) every further call is answered
`budget_exhausted` and one last step must answer; if it still calls tools the
turn ends with the fixed `agent_budget` sentence.

A `ProviderUnavailable` (the model's API down, or rate-limited past its
retries) before the turn sent anything becomes the fixed `agent_retry`
sentence, the failed step's span keeping its error; once events went out it
propagates and the stream sends its `error` event, as for every other turn.
"""

import json
import logging
import re
from collections.abc import AsyncIterator, Sequence
from typing import Protocol

from travel_common.exceptions import ProviderUnavailable

from ai_api.application.plan_trip import Turn
from ai_api.application.tracing import traced_converse
from ai_api.application.validate import strip_prices
from ai_api.domain.agent import (
    AgentMessage,
    StepEnd,
    TextDelta,
    ToolCall,
    ToolCallReady,
    ToolResult,
    ToolSpec,
)
from ai_api.domain.ports import LLMProvider
from ai_api.prompts import AGENT_SYSTEM_PROMPT, planner_text
from ai_api.schemas.planner_events import PlannerEvent, TextEvent, text

logger = logging.getLogger(__name__)

BUDGET_EXHAUSTED = json.dumps(
    {"error": "budget_exhausted", "say": "answer the traveller now"}
)

FLUSH_CHARS = 200
"""Longest text held back while waiting for the end of a sentence."""

_SENTENCE_END = re.compile(r"[.!?]\s|\n")
_SPACE = re.compile(r"\s")
_CURRENCY = re.compile(
    r"(?:[€$£]|\b(?:EUR|USD|GBP|HUF|Ft|eur|usd|gbp|huf|euros?|dollars?|d[oó]lares"
    r"|forints?))\s*$",
    re.IGNORECASE,
)


class Toolbox(Protocol):
    specs: list[ToolSpec]

    def note_text(self) -> None: ...

    def stream(self, call: ToolCall) -> AsyncIterator[PlannerEvent | ToolResult]: ...


class ProseFilter:
    """Streamed text cut where a price cannot straddle the cut, each piece
    through `strip_prices` (TRA-290, from TRA-292).

    A piece ends after `.`, `!` or `?` followed by whitespace, after a
    newline, or — when nothing ends a sentence within `FLUSH_CHARS` — at the
    last space; never right after a digit or a currency, nor before one.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self.stripped = 0

    def feed(self, delta: str) -> list[str]:
        self._buffer += delta
        cut = self._last_cut(_SENTENCE_END)
        if cut is None and len(self._buffer) >= FLUSH_CHARS:
            cut = self._last_cut(_SPACE)
        if cut is None:
            return []
        piece, self._buffer = self._buffer[:cut], self._buffer[cut:]
        return [self._clean(piece)]

    def flush(self) -> list[str]:
        piece, self._buffer = self._buffer, ""
        return [self._clean(piece)] if piece else []

    def _last_cut(self, boundary: re.Pattern[str]) -> int | None:
        for match in reversed(list(boundary.finditer(self._buffer))):
            cut = match.end()
            if _safe(self._buffer[:cut], self._buffer[cut:]):
                return cut
        return None

    def _clean(self, piece: str) -> str:
        clean, found = strip_prices(piece)
        self.stripped += int(found)
        return clean


def _safe(before: str, after: str) -> bool:
    """A cut between `before` and `after` that splits no amount from its
    currency: never right after a digit, and — at a space or a newline, which
    the price pattern may span — never after a currency nor before a digit
    or a currency symbol. Past `.`, `!` or `?` only the digit rule matters:
    no amount runs across a full stop and a space."""
    head = before.rstrip()
    if not head or head[-1].isdigit():
        return False
    if head[-1] in ".!?":
        return not (len(head) > 1 and head[-2].isdigit())
    if _CURRENCY.search(head):
        return False
    tail = after.lstrip()
    return not tail or not (tail[0].isdigit() or tail[0] in "€$£")


async def run_agent(
    turn: Turn,
    provider: LLMProvider,
    toolbox: Toolbox,
    *,
    system: Sequence[str],
    messages: Sequence[AgentMessage],
    max_steps: int,
    max_tool_calls: int,
    template: str = AGENT_SYSTEM_PROMPT,
) -> AsyncIterator[PlannerEvent]:
    """Kiri's turn as planner events; `template` is the system prompt's
    template, for the trace's prompt version."""
    sent = False
    try:
        async for event in _steps(
            turn,
            provider,
            toolbox,
            system=system,
            messages=messages,
            max_steps=max_steps,
            max_tool_calls=max_tool_calls,
            template=template,
        ):
            sent = True
            yield event
    except ProviderUnavailable as exc:
        if sent:
            raise
        # Nothing reached the page: one fixed sentence instead of an error.
        logger.warning("Agent step unavailable, asking again: %s", exc.message)
        turn.phase("zip")
        yield text(planner_text(turn.language, "agent_retry"))


async def _steps(
    turn: Turn,
    provider: LLMProvider,
    toolbox: Toolbox,
    *,
    system: Sequence[str],
    messages: Sequence[AgentMessage],
    max_steps: int,
    max_tool_calls: int,
    template: str,
) -> AsyncIterator[PlannerEvent]:
    conversation = list(messages)
    steps = 0
    calls_run = 0
    last_step = False
    prose = ProseFilter()
    streamed = False
    lead = ""
    try:
        while True:
            steps += 1
            parts: list[str] = []
            calls: list[ToolCall] = []
            async for item in traced_converse(
                provider,
                system,
                conversation,
                toolbox.specs,
                name=f"agent:{steps}",
                traveller_message=turn.message,
                tracer=turn.tracer,
                template=template,
            ):
                if isinstance(item, TextDelta):
                    parts.append(item.text)
                    for piece in prose.feed(item.text):
                        yield text(lead + piece)
                        lead, streamed = "", True
                        toolbox.note_text()
                elif isinstance(item, ToolCallReady):
                    calls.append(item.call)
                elif isinstance(item, StepEnd) and item.stop_reason == "end_turn":
                    turn.phase("zip")
            for piece in prose.flush():
                yield text(lead + piece)
                lead, streamed = "", True
                toolbox.note_text()
            if not calls:
                return
            if "".join(parts).strip():
                # What the next step says is a new paragraph, not a run-on.
                lead = "\n\n"
            if last_step:
                turn.phase("zip")
                lead = "\n\n" if streamed else ""
                yield text(lead + planner_text(turn.language, "agent_budget"))
                return
            results: list[ToolResult] = []
            for call in calls:
                # Step `max_steps` runs no tool: the step after it is the last.
                if steps >= max_steps or calls_run >= max_tool_calls:
                    last_step = True
                    results.append(
                        ToolResult(
                            call_id=call.id, content=BUDGET_EXHAUSTED, is_error=True
                        )
                    )
                    continue
                calls_run += 1
                async for item in toolbox.stream(call):
                    if isinstance(item, ToolResult):
                        results.append(item)
                        continue
                    if isinstance(item, TextEvent):
                        # A tool's own sentence: Kiri's next words start apart.
                        lead, streamed = "\n\n", True
                        toolbox.note_text()
                    yield item
            conversation.append(
                AgentMessage(
                    role="assistant", text="".join(parts), tool_calls=tuple(calls)
                )
            )
            conversation.append(AgentMessage(role="user", tool_results=tuple(results)))
    finally:
        if prose.stripped:
            with turn.tracer.sync_span("chain", "strip_prices") as span:
                span.payload["details"] = {"stripped": prose.stripped}
