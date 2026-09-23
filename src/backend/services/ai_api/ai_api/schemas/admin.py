"""The admin API's responses over the turn traces (ADR 0024, TRA-221).

Each model mirrors a dataclass of `domain/tracing.py` or
`application/trace_stats.py` field by field. Like the planner's schemas,
nothing has a default: every field is sent (`null` when unknown), so the
generated type marks none optional. A step's `payload` is typed loosely on
purpose: its keys depend on the step's kind (the README lists them).
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from ai_api.domain.tracing import Kind, Level, Phase, SpanKind, Status


class _FromAttributes(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RetrievedDocResponse(_FromAttributes):
    doc_id: str
    title: str | None
    category: str | None
    district: str | None
    distance: float | None
    rank: int
    used: bool


class TurnSummaryResponse(_FromAttributes):
    """One turn as a list shows it; `day` and `sk` are its summary's key."""

    turn_id: str
    ts: datetime
    day: str
    sk: str
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
    sources: list[RetrievedDocResponse]
    question_preview: str
    answer_preview: str
    truncated: bool


class TurnPageResponse(_FromAttributes):
    """A page of turns; pass `next_cursor` back to read the next one."""

    items: list[TurnSummaryResponse]
    next_cursor: str | None


class TurnContextResponse(_FromAttributes):
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
    truncated: bool


class SpanResponse(_FromAttributes):
    """One step of a turn; `payload` holds its kind's keys."""

    seq: int
    parent_seq: int | None
    kind: SpanKind
    name: str
    phase: Phase
    t0_ms: int
    dur_ms: int | None
    level: Level
    message: str | None
    payload: dict[str, Any]
    results: list[RetrievedDocResponse]


class EventMarkResponse(_FromAttributes):
    """One SSE event as it left; `count` collapses consecutive text deltas."""

    t_ms: int
    type: str
    summary: str
    bytes: int
    count: int


class TurnDetailResponse(_FromAttributes):
    """One turn, whole: summary, context, steps by `seq`, SSE timeline."""

    summary: TurnSummaryResponse
    context: TurnContextResponse
    spans: list[SpanResponse]
    timeline: list[EventMarkResponse]


# ─── Stats ──────────────────────────────────────────────────────────────────


class DayStatsResponse(_FromAttributes):
    day: str
    turns: int
    ok: int
    errors: int
    cancelled: int
    input_tokens: int
    output_tokens: int
    embed_tokens: int
    cost_usd: float
    latency_p50_ms: int | None
    latency_p95_ms: int | None
    first_event_p50_ms: int | None


class TotalsResponse(_FromAttributes):
    turns: int
    ok: int
    errors: int
    cancelled: int
    input_tokens: int
    output_tokens: int
    embed_tokens: int
    cost_usd: float
    latency_p50_ms: int | None
    latency_p95_ms: int | None
    first_event_p50_ms: int | None
    subjects: int
    sessions: int


class KindStatsResponse(_FromAttributes):
    kind: str
    turns: int
    errors: int
    cost_usd: float


class ModelStatsResponse(_FromAttributes):
    model: str
    turns: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class CityStatsResponse(_FromAttributes):
    city: str
    turns: int
    errors: int


class RagStatsResponse(_FromAttributes):
    retrievals_per_turn: float | None
    no_hit_rate: float | None
    used_over_retrieved: float | None
    mean_distance_used: float | None
    repair_rate: float | None
    dropped_ids: int


class UsedDocResponse(_FromAttributes):
    doc_id: str
    title: str | None
    count: int


class NeverUsedDocResponse(_FromAttributes):
    doc_id: str
    title: str | None
    retrieved: int


class TraceStatsResponse(_FromAttributes):
    """The stats of a range of days; definitions in `application/trace_stats.py`."""

    start: str
    end: str
    days: list[DayStatsResponse]
    totals: TotalsResponse
    by_kind: list[KindStatsResponse]
    by_model: list[ModelStatsResponse]
    by_city: list[CityStatsResponse]
    rag: RagStatsResponse
    top_used: list[UsedDocResponse]
    never_used: list[NeverUsedDocResponse]
