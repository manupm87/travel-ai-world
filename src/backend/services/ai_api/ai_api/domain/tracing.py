"""What one request to `ai_api` did, step by step (ADR 0024).

A `TurnTrace` is one planner turn, one chat answer or one card detail: a
summary (who, what, how much, how fast), the request context, one `Span` per
step (a model call, a retrieval, an external tool, a code step) and the SSE
timeline. The vocabulary is the industry's (Langfuse's trace / observation,
OpenInference's span kinds), so the data can be exported as it is.

Plain dataclasses: the tracer (`application/tracing.py`) fills them, the
adapter (`infrastructure/dynamo_traces.py`) writes them.
"""

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
