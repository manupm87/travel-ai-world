"""Range stats over the turn summaries (ADR 0024, TRA-221).

Pure: `compute` takes the summaries of a range of days (what
`TraceLog.iter_range` yields) and aggregates them in Python. Every day of the
range is present, with zeros when it had no turn.

Definitions (one line each, the admin API's README repeats them):

- latency percentiles: nearest rank over `latency_ms`; `first_event_p50_ms`
  over the turns that sent an event; `None` without turns.
- `cost_usd`: the sum of the priced turns (an unpriced model counts nothing).
- `retrievals_per_turn`: retrievals / turns.
- `no_hit_rate`: turns that searched and got nothing (`retrievals > 0` and
  `docs_retrieved == 0`) / turns that searched. A proxy: the summary does not
  keep a per-search hit count.
- `used_over_retrieved`: Σ `docs_used` / Σ `docs_retrieved`.
- `mean_distance_used`: mean distance of the used sources that have one.
- `repair_rate`: turns with a repaired structured answer / turns that called
  a model.
- `dropped_ids`: Σ ids a model picked that were not among the candidates.
- `top_used`: the documents used by most turns; `never_used`: documents
  retrieved at least twice and never used in the range.
"""

import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import TypedDict

from ai_api.domain.tracing import TurnSummary

TOP_DOCS = 20
"""Documents listed in `top_used` and in `never_used`."""

NEVER_USED_MIN_RETRIEVED = 2
"""Times a never used document must have been retrieved to be listed."""

UNKNOWN = "unknown"
"""The group of the turns without a model or a city."""


class _Counts(TypedDict):
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


@dataclass(slots=True)
class Totals:
    turns: int = 0
    ok: int = 0
    errors: int = 0
    cancelled: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    embed_tokens: int = 0
    cost_usd: float = 0.0
    latency_p50_ms: int | None = None
    latency_p95_ms: int | None = None
    first_event_p50_ms: int | None = None
    subjects: int = 0
    sessions: int = 0


@dataclass(slots=True)
class DayStats:
    day: str
    turns: int = 0
    ok: int = 0
    errors: int = 0
    cancelled: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    embed_tokens: int = 0
    cost_usd: float = 0.0
    latency_p50_ms: int | None = None
    latency_p95_ms: int | None = None
    first_event_p50_ms: int | None = None


@dataclass(slots=True)
class KindStats:
    kind: str
    turns: int = 0
    errors: int = 0
    cost_usd: float = 0.0


@dataclass(slots=True)
class ModelStats:
    model: str
    turns: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


@dataclass(slots=True)
class CityStats:
    city: str
    turns: int = 0
    errors: int = 0


@dataclass(slots=True)
class RagStats:
    retrievals_per_turn: float | None
    no_hit_rate: float | None
    used_over_retrieved: float | None
    mean_distance_used: float | None
    repair_rate: float | None
    dropped_ids: int


@dataclass(slots=True)
class UsedDoc:
    doc_id: str
    title: str | None
    count: int


@dataclass(slots=True)
class NeverUsedDoc:
    doc_id: str
    title: str | None
    retrieved: int


@dataclass(slots=True)
class TraceStats:
    start: str
    end: str
    days: list[DayStats]
    totals: Totals
    by_kind: list[KindStats]
    by_model: list[ModelStats]
    by_city: list[CityStats]
    rag: RagStats
    top_used: list[UsedDoc] = field(default_factory=list)
    never_used: list[NeverUsedDoc] = field(default_factory=list)


def percentile(values: Iterable[int], p: float) -> int | None:
    """Nearest rank: the smallest value with at least `p` % of the values at
    or below it; `None` when there is none."""
    ordered = sorted(values)
    if not ordered:
        return None
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def compute(summaries: Iterable[TurnSummary], start: date, end: date) -> TraceStats:
    """The stats of `[start, end]`; summaries of other days are ignored."""
    first, last = start.isoformat(), end.isoformat()
    turns = [t for t in summaries if first <= t.day <= last]

    by_day: dict[str, list[TurnSummary]] = defaultdict(list)
    for turn in turns:
        by_day[turn.day].append(turn)
    days: list[DayStats] = []
    day = start
    while day <= end:
        key = day.isoformat()
        days.append(DayStats(day=key, **_counts(by_day.get(key, []))))
        day += timedelta(days=1)

    totals = Totals(
        **_counts(turns),
        subjects=len({t.subject for t in turns}),
        sessions=len({t.session_id for t in turns if t.session_id}),
    )
    return TraceStats(
        start=first,
        end=last,
        days=days,
        totals=totals,
        by_kind=_by_kind(turns),
        by_model=_by_model(turns),
        by_city=_by_city(turns),
        rag=_rag(turns),
        top_used=_top_used(turns),
        never_used=_never_used(turns),
    )


def _counts(turns: list[TurnSummary]) -> _Counts:
    return {
        "turns": len(turns),
        "ok": sum(t.status == "ok" for t in turns),
        "errors": sum(t.status == "error" for t in turns),
        "cancelled": sum(t.status == "cancelled" for t in turns),
        "input_tokens": sum(t.input_tokens for t in turns),
        "output_tokens": sum(t.output_tokens for t in turns),
        "embed_tokens": sum(t.embed_tokens for t in turns),
        "cost_usd": _cost(turns),
        "latency_p50_ms": percentile((t.latency_ms for t in turns), 50),
        "latency_p95_ms": percentile((t.latency_ms for t in turns), 95),
        "first_event_p50_ms": percentile(
            (t.first_event_ms for t in turns if t.first_event_ms is not None), 50
        ),
    }


def _cost(turns: Iterable[TurnSummary]) -> float:
    return round(sum(t.cost_usd for t in turns if t.cost_usd is not None), 6)


def _by_kind(turns: list[TurnSummary]) -> list[KindStats]:
    groups: dict[str, list[TurnSummary]] = defaultdict(list)
    for turn in turns:
        groups[turn.kind].append(turn)
    stats = [
        KindStats(
            kind=kind,
            turns=len(group),
            errors=sum(t.status == "error" for t in group),
            cost_usd=_cost(group),
        )
        for kind, group in groups.items()
    ]
    return sorted(stats, key=lambda s: (-s.turns, s.kind))


def _by_model(turns: list[TurnSummary]) -> list[ModelStats]:
    groups: dict[str, list[TurnSummary]] = defaultdict(list)
    for turn in turns:
        groups[turn.model or UNKNOWN].append(turn)
    stats = [
        ModelStats(
            model=model,
            turns=len(group),
            input_tokens=sum(t.input_tokens for t in group),
            output_tokens=sum(t.output_tokens for t in group),
            cost_usd=_cost(group),
        )
        for model, group in groups.items()
    ]
    return sorted(stats, key=lambda s: (-s.turns, s.model))


def _by_city(turns: list[TurnSummary]) -> list[CityStats]:
    groups: dict[str, list[TurnSummary]] = defaultdict(list)
    for turn in turns:
        groups[turn.city or UNKNOWN].append(turn)
    stats = [
        CityStats(
            city=city,
            turns=len(group),
            errors=sum(t.status == "error" for t in group),
        )
        for city, group in groups.items()
    ]
    return sorted(stats, key=lambda s: (-s.turns, s.city))


def _ratio(part: float, whole: float) -> float | None:
    return part / whole if whole else None


def _rag(turns: list[TurnSummary]) -> RagStats:
    searched = [t for t in turns if t.retrievals > 0]
    called = [t for t in turns if t.llm_calls > 0]
    distances = [
        doc.distance
        for t in turns
        for doc in t.sources
        if doc.used and doc.distance is not None
    ]
    return RagStats(
        retrievals_per_turn=_ratio(sum(t.retrievals for t in turns), len(turns)),
        no_hit_rate=_ratio(sum(t.docs_retrieved == 0 for t in searched), len(searched)),
        used_over_retrieved=_ratio(
            sum(t.docs_used for t in turns), sum(t.docs_retrieved for t in turns)
        ),
        mean_distance_used=_ratio(sum(distances), len(distances)),
        repair_rate=_ratio(sum(t.repairs > 0 for t in called), len(called)),
        dropped_ids=sum(t.dropped_ids for t in turns),
    )


def _titles(turns: list[TurnSummary]) -> dict[str, str | None]:
    titles: dict[str, str | None] = {}
    for turn in turns:
        for doc in turn.sources:
            if doc.title or doc.doc_id not in titles:
                titles[doc.doc_id] = doc.title
    return titles


def _top_used(turns: list[TurnSummary]) -> list[UsedDoc]:
    """Documents by the number of turns that used them."""
    used: Counter[str] = Counter()
    for turn in turns:
        used.update({doc.doc_id for doc in turn.sources if doc.used})
    titles = _titles(turns)
    ranked = sorted(used.items(), key=lambda item: (-item[1], item[0]))
    return [
        UsedDoc(doc_id=doc_id, title=titles.get(doc_id), count=count)
        for doc_id, count in ranked[:TOP_DOCS]
    ]


def _never_used(turns: list[TurnSummary]) -> list[NeverUsedDoc]:
    """Documents retrieved at least `NEVER_USED_MIN_RETRIEVED` times (one
    count per retrieval that listed them) and never used."""
    retrieved: Counter[str] = Counter()
    used: set[str] = set()
    for turn in turns:
        for doc in turn.sources:
            retrieved[doc.doc_id] += 1
            if doc.used:
                used.add(doc.doc_id)
    titles = _titles(turns)
    ranked = sorted(
        (
            (doc_id, count)
            for doc_id, count in retrieved.items()
            if doc_id not in used and count >= NEVER_USED_MIN_RETRIEVED
        ),
        key=lambda item: (-item[1], item[0]),
    )
    return [
        NeverUsedDoc(doc_id=doc_id, title=titles.get(doc_id), retrieved=count)
        for doc_id, count in ranked[:TOP_DOCS]
    ]
