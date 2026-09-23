"""What one request to `ai_api` did, step by step (ADR 0024).

A `TurnTrace` is one planner turn, one chat answer or one card detail: a
summary (who, what, how much, how fast), the request context, one `Span` per
step (a model call, a retrieval, an external tool, a code step) and the SSE
timeline. The vocabulary is the industry's (Langfuse's trace / observation,
OpenInference's span kinds), so the data can be exported as it is.

Plain dataclasses: the tracer (`application/tracing.py`) fills them, the
adapter (`infrastructure/dynamo_traces.py`) writes them. The read models
(`TurnSummary`, `TurnDetail`, `TurnFilters`, `TurnPage`) are what the admin
API reads back (TRA-221).
"""

import dataclasses
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

Kind = Literal["planner", "chat", "card"]
Status = Literal["ok", "error", "cancelled"]
SpanKind = Literal["llm", "retriever", "tool", "chain"]
Phase = Literal["open", "wardrobe", "fold", "weigh", "zip"]
Level = Literal["default", "warning", "error"]

MAX_SPANS = 200
"""Steps kept per turn; beyond, the trace is marked `truncated`."""

MAX_EVENT_MARKS = 500
"""SSE timeline marks kept per turn (text deltas collapse into one)."""

MAX_SOURCES = 200
"""Retrieved documents listed on the summary item."""

PREVIEW_CHARS = 200
"""Length of the question and answer previews on the summary item."""


@dataclass(slots=True)
class RetrievedDoc:
    """One document a retrieval returned, and whether the turn used it."""

    doc_id: str
    title: str | None
    category: str | None
    district: str | None
    distance: float | None
    rank: int
    used: bool = False


@dataclass(slots=True)
class Span:
    """One step of a turn. `payload` holds the kind's keys (every key present,
    `None` when unknown); `results` only a retriever's documents."""

    seq: int
    parent_seq: int | None
    kind: SpanKind
    name: str
    phase: Phase
    t0_ms: int
    dur_ms: int | None = None
    level: Level = "default"
    message: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    results: list[RetrievedDoc] = field(default_factory=list)


@dataclass(slots=True)
class EventMark:
    """One SSE event as it left: when, which type, a one-line summary, its size.
    Consecutive `text` deltas collapse into one mark (`count`)."""

    t_ms: int
    type: str
    summary: str
    bytes: int
    count: int = 1


@dataclass(slots=True)
class TurnContext:
    """The request and the answer, truncated to the payload cap."""

    message: str | None
    action: dict[str, Any] | None
    brief: dict[str, Any] | None
    itinerary_ids: list[str]
    exclude_card_ids: list[str]
    history: list[dict[str, str]]
    answer_text: str
    ops: list[dict[str, Any]]
    option_groups: list[dict[str, Any]]
    truncated: bool = False


@dataclass(slots=True)
class TurnTrace:
    turn_id: str
    ts: datetime
    kind: Kind
    route: str
    subject: str
    session_id: str | None
    trip_id: str | None
    city: str | None
    language: str | None
    action: str | None
    """`message`, `select:<group id>` or `remove`; `None` outside the planner."""
    model: str | None
    provider: str | None
    prompt_version: str | None
    input_tokens: int
    output_tokens: int
    embed_tokens: int
    cost_usd: float | None
    pricing_version: str
    latency_ms: int
    first_event_ms: int | None
    status: Status
    error_code: str | None
    llm_calls: int
    retrievals: int
    docs_retrieved: int
    docs_used: int
    repairs: int
    dropped_ids: int
    prices_stripped: int
    warnings: int
    events: dict[str, int]
    ops: dict[str, int]
    sources: list[RetrievedDoc]
    question_preview: str
    answer_preview: str
    truncated: bool
    spans: list[Span]
    timeline: list[EventMark]
    context: TurnContext

    def summary(self, day: str, sk: str) -> "TurnSummary":
        """The summary item's view of this trace (what a list shows)."""
        values = {
            f.name: getattr(self, f.name)
            for f in dataclasses.fields(TurnSummary)
            if f.name not in ("day", "sk")
        }
        return TurnSummary(**values, day=day, sk=sk)


# ─── Read models (admin API) ────────────────────────────────────────────────


@dataclass(slots=True)
class TurnSummary:
    """One turn as a list shows it: every `TurnTrace` field but the steps,
    the timeline and the context, plus the summary item's day and key."""

    turn_id: str
    ts: datetime
    kind: Kind
    route: str
    subject: str
    session_id: str | None
    trip_id: str | None
    city: str | None
    language: str | None
    action: str | None
    model: str | None
    provider: str | None
    prompt_version: str | None
    input_tokens: int
    output_tokens: int
    embed_tokens: int
    cost_usd: float | None
    pricing_version: str
    latency_ms: int
    first_event_ms: int | None
    status: Status
    error_code: str | None
    llm_calls: int
    retrievals: int
    docs_retrieved: int
    docs_used: int
    repairs: int
    dropped_ids: int
    prices_stripped: int
    warnings: int
    events: dict[str, int]
    ops: dict[str, int]
    sources: list[RetrievedDoc]
    question_preview: str
    answer_preview: str
    truncated: bool
    day: str
    sk: str


@dataclass(slots=True)
class TurnDetail:
    """One turn, whole: its summary, the request context, every step (by
    `seq`) and the SSE timeline."""

    summary: TurnSummary
    context: TurnContext
    spans: list[Span]
    timeline: list[EventMark]


@dataclass(slots=True)
class TurnFilters:
    """What a list keeps; `None` keeps everything."""

    kind: Kind | None = None
    status: Status | None = None
    subject: str | None = None
    session_id: str | None = None
    trip_id: str | None = None
    city: str | None = None

    def matches(self, turn: TurnSummary) -> bool:
        return all(
            wanted is None or getattr(turn, name) == wanted
            for name, wanted in self.active().items()
        )

    def active(self) -> dict[str, str]:
        """The filters in force, by summary attribute name."""
        return {
            f.name: value
            for f in dataclasses.fields(self)
            if (value := getattr(self, f.name)) is not None
        }


@dataclass(slots=True)
class TurnPage:
    items: list[TurnSummary]
    next_cursor: str | None
