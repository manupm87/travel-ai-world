"""Retrieval quality: recall@k, MRR, and an approximate store against exact search."""

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import fmean

from vector_store_bench.search import Hit


@dataclass(frozen=True)
class Quality:
    queries: int
    recall_at_5: float
    recall_at_10: float
    mrr: float

    def as_row(self) -> dict[str, float | int]:
        return {
            "queries": self.queries,
            "recall@5": round(self.recall_at_5, 3),
            "recall@10": round(self.recall_at_10, 3),
            "mrr": round(self.mrr, 3),
        }


def recall_at(hits: Sequence[Hit], expected: Sequence[str], k: int) -> float:
    """Share of the expected documents found in the first `k` hits."""
    if not expected:
        return 0.0
    found = {h.doc_id for h in hits[:k]} & set(expected)
    return len(found) / len(expected)


def reciprocal_rank(hits: Sequence[Hit], expected: Sequence[str]) -> float:
    wanted = set(expected)
    for rank, hit in enumerate(hits, start=1):
        if hit.doc_id in wanted:
            return 1 / rank
    return 0.0


def score(results: Sequence[tuple[Sequence[Hit], Sequence[str]]]) -> Quality:
    if not results:
        return Quality(0, 0.0, 0.0, 0.0)
    return Quality(
        queries=len(results),
        recall_at_5=fmean(recall_at(hits, expected, 5) for hits, expected in results),
        recall_at_10=fmean(recall_at(hits, expected, 10) for hits, expected in results),
        mrr=fmean(reciprocal_rank(hits, expected) for hits, expected in results),
    )


def agreement_with_exact(
    approximate: Sequence[Hit], exact: Sequence[Hit], k: int
) -> float:
    """How much of exact search's top `k` an approximate store returns — the
    number AWS quotes as "90%+ average recall" for S3 Vectors."""
    if not exact[:k]:
        return 0.0
    return len(
        {h.doc_id for h in approximate[:k]} & {h.doc_id for h in exact[:k]}
    ) / len(exact[:k])
