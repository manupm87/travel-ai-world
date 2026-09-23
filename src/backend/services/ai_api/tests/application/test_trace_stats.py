"""`application.trace_stats`: range stats over turn summaries (TRA-221)."""

from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from ai_api.application.trace_stats import compute, percentile
from ai_api.domain.tracing import RetrievedDoc, TurnSummary
from ai_api.testing import make_trace

DAY = date(2026, 9, 23)


def summary(n: int = 0, **overrides: Any) -> TurnSummary:
    ts = overrides.pop("ts", datetime(2026, 9, 23, 10, 0, tzinfo=UTC))
    trace = make_trace(turn_id=f"t{n}", ts=ts + timedelta(seconds=n), **overrides)
    return trace.summary(trace.ts.date().isoformat(), f"{trace.ts}#{trace.turn_id}")


def doc(doc_id: str, *, used: bool, distance: float | None = 0.2) -> RetrievedDoc:
    return RetrievedDoc(
        doc_id=doc_id,
        title=doc_id.upper(),
        category=None,
        district=None,
        distance=distance,
        rank=1,
        used=used,
    )


@pytest.mark.parametrize(
    ("values", "p50", "p95"),
    [
        ([7], 7, 7),
        ([10, 20], 10, 20),
        (list(range(1, 21)), 10, 19),
    ],
)
def test_percentiles_are_nearest_rank(values: list[int], p50: int, p95: int):
    assert percentile(values, 50) == p50
    assert percentile(values, 95) == p95


def test_no_values_have_no_percentile():
    assert percentile([], 50) is None


def test_an_empty_range_has_every_day_at_zero():
    stats = compute([], date(2026, 9, 21), DAY)

    assert [d.day for d in stats.days] == ["2026-09-21", "2026-09-22", "2026-09-23"]
    assert all(d.turns == 0 and d.cost_usd == 0 for d in stats.days)
    assert stats.days[0].latency_p50_ms is None
    assert stats.totals.turns == 0 and stats.totals.subjects == 0
    assert stats.by_kind == [] and stats.by_model == [] and stats.by_city == []
    assert stats.rag.retrievals_per_turn is None
    assert stats.rag.no_hit_rate is None and stats.rag.repair_rate is None
    assert stats.top_used == [] and stats.never_used == []


def test_summaries_outside_the_range_are_ignored():
    stats = compute([summary(1, ts=datetime(2026, 9, 20, 10, 0, tzinfo=UTC))], DAY, DAY)

    assert stats.totals.turns == 0


def test_by_model_is_sorted_by_turns_and_groups_unknown():
    turns = [
        summary(1, model="model-a"),
        summary(2, model="model-b"),
        summary(3, model="model-b"),
        summary(4, model=None, cost_usd=None),
    ]

    stats = compute(turns, DAY, DAY)

    assert [(m.model, m.turns) for m in stats.by_model] == [
        ("model-b", 2),
        ("model-a", 1),
        ("unknown", 1),
    ]
    assert stats.by_model[2].cost_usd == 0
    assert stats.totals.cost_usd == pytest.approx(0.003)


def test_rag_ratios():
    turns = [
        # Searched, 4 retrieved, 2 used, one repair.
        summary(
            1,
            retrievals=2,
            docs_retrieved=4,
            docs_used=2,
            repairs=1,
            dropped_ids=3,
            sources=[
                doc("a", used=True, distance=0.1),
                doc("b", used=True, distance=0.3),
                doc("c", used=False),
                doc("d", used=True, distance=None),
            ],
        ),
        # Searched and found nothing.
        summary(2, retrievals=1, docs_retrieved=0, docs_used=0, sources=[]),
        # Never searched, never called a model.
        summary(
            3,
            retrievals=0,
            docs_retrieved=0,
            docs_used=0,
            llm_calls=0,
            sources=[],
        ),
    ]

    rag = compute(turns, DAY, DAY).rag

    assert rag.retrievals_per_turn == pytest.approx(1.0)
    assert rag.no_hit_rate == pytest.approx(0.5)
    assert rag.used_over_retrieved == pytest.approx(0.5)
    assert rag.mean_distance_used == pytest.approx(0.2)
    assert rag.repair_rate == pytest.approx(0.5)
    assert rag.dropped_ids == 3


def test_never_used_needs_two_retrievals_and_no_use():
    turns = [
        summary(1, sources=[doc("twice", used=False), doc("used", used=True)]),
        summary(2, sources=[doc("twice", used=False), doc("used", used=False)]),
        summary(3, sources=[doc("once", used=False)]),
    ]

    stats = compute(turns, DAY, DAY)

    assert [(d.doc_id, d.retrieved) for d in stats.never_used] == [("twice", 2)]
    assert stats.never_used[0].title == "TWICE"
    assert [(d.doc_id, d.count) for d in stats.top_used] == [("used", 1)]


def test_totals_count_distinct_subjects_and_sessions():
    turns = [
        summary(1, subject="a", session_id="s1"),
        summary(2, subject="a", session_id="s1"),
        summary(3, subject="b", session_id=None, status="cancelled"),
    ]

    totals = compute(turns, DAY, DAY).totals

    assert (totals.subjects, totals.sessions) == (2, 1)
    assert (totals.ok, totals.cancelled, totals.errors) == (2, 1, 0)
    assert totals.input_tokens == 300
