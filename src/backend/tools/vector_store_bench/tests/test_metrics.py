import pytest
from vector_store_bench.metrics import (
    agreement_with_exact,
    recall_at,
    reciprocal_rank,
    score,
)
from vector_store_bench.search import Hit

HITS = [Hit(name, 1.0) for name in ("a", "b", "c", "d", "e", "f")]


def test_recall_counts_only_the_first_k() -> None:
    assert recall_at(HITS, ["a", "f"], k=5) == 0.5
    assert recall_at(HITS, ["a", "f"], k=10) == 1.0
    assert recall_at(HITS, [], k=5) == 0.0


def test_reciprocal_rank_uses_the_first_expected_hit() -> None:
    assert reciprocal_rank(HITS, ["c"]) == pytest.approx(1 / 3)
    assert reciprocal_rank(HITS, ["zz"]) == 0.0


def test_score_averages_over_queries() -> None:
    quality = score([(HITS, ["a"]), (HITS, ["zz"])])
    assert quality.queries == 2
    assert quality.mrr == pytest.approx(0.5)
    assert quality.as_row()["recall@5"] == 0.5


def test_agreement_with_exact() -> None:
    exact = HITS[:5]
    approximate = [
        Hit("a", 1.0),
        Hit("b", 1.0),
        Hit("zz", 1.0),
        Hit("d", 1.0),
        Hit("e", 1.0),
    ]
    assert agreement_with_exact(approximate, exact, k=5) == 0.8
    assert agreement_with_exact(approximate, [], k=5) == 0.0
