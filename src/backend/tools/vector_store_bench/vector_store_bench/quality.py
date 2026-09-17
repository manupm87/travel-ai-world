"""Retrieval quality of each candidate on the evaluation set.

Everything here runs without the spike stack: exact search is numpy, candidate A
runs in process (same Qdrant engine as the Lambda would), and candidate B joins
later with the same queries. Latency and cost need AWS; quality does not.
"""

import csv
import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from vector_store_bench import artifact, corpus, evalset, metrics
from vector_store_bench.search import (
    Bm25Index,
    Hit,
    exact_search,
    reciprocal_rank_fusion,
)

logger = logging.getLogger(__name__)
TOP_K = 10


@dataclass(frozen=True)
class Run:
    """One retrieval strategy scored over the whole evaluation set."""

    name: str
    quality: metrics.Quality
    agreement_at_10: float | None = None

    def as_row(self) -> dict[str, object]:
        row: dict[str, object] = {"strategy": self.name, **self.quality.as_row()}
        row["agreement@10_vs_exact"] = (
            "" if self.agreement_at_10 is None else round(self.agreement_at_10, 3)
        )
        return row


def embed_queries(
    queries: Sequence[evalset.EvalQuery], embed: Callable[[str], np.ndarray]
) -> dict[str, np.ndarray]:
    return {q.id: embed(q.query) for q in queries}


def run_strategies(
    documents: Sequence[corpus.Document],
    embeddings: artifact.Embeddings,
    queries: Sequence[evalset.EvalQuery],
    vectors: dict[str, np.ndarray],
    *,
    stores: dict[str, Callable[[np.ndarray, str, int], list[Hit]]] | None = None,
) -> list[Run]:
    """Exact dense, BM25 and their fusion, plus any store passed in."""
    by_id = {d.doc_id: d for d in documents}
    texts = [f"{by_id[i].name or ''} {by_id[i].text}" for i in embeddings.doc_ids]
    keyword = Bm25Index(embeddings.doc_ids, texts)
    matrix = embeddings.vectors

    strategies: dict[str, Callable[[np.ndarray, str, int], list[Hit]]] = {
        "exact dense (numpy)": lambda vector, _text, k: exact_search(
            matrix, vector, k, embeddings.doc_ids
        ),
        "BM25 only": lambda _vector, text, k: keyword.search(text, k),
        "exact dense + BM25 (RRF)": lambda vector, text, k: reciprocal_rank_fusion(
            [
                exact_search(matrix, vector, k * 2, embeddings.doc_ids),
                keyword.search(text, k * 2),
            ],
            k,
        ),
        **(stores or {}),
    }

    exact_hits = {
        q.id: exact_search(matrix, vectors[q.id], TOP_K, embeddings.doc_ids)
        for q in queries
    }
    runs: list[Run] = []
    for name, search in strategies.items():
        scored: list[tuple[Sequence[Hit], Sequence[str]]] = []
        agreements: list[float] = []
        for query in queries:
            hits = search(vectors[query.id], query.query, TOP_K)
            scored.append((hits, query.expected))
            agreements.append(
                metrics.agreement_with_exact(hits, exact_hits[query.id], TOP_K)
            )
        agreement = sum(agreements) / len(agreements) if agreements else 0.0
        runs.append(
            Run(
                name=name,
                quality=metrics.score(scored),
                agreement_at_10=None if name.startswith("exact dense (") else agreement,
            )
        )
    return runs


def write_csv(path: Path, runs: Sequence[Run]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [run.as_row() for run in runs]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def as_table(runs: Sequence[Run]) -> str:
    rows = [run.as_row() for run in runs]
    headers = list(rows[0])
    widths = [max(len(h), *(len(str(row[h])) for row in rows)) for h in headers]
    lines = [
        "  ".join(h.ljust(w) for h, w in zip(headers, widths, strict=True)),
        "  ".join("-" * w for w in widths),
    ]
    lines += [
        "  ".join(str(row[h]).ljust(w) for h, w in zip(headers, widths, strict=True))
        for row in rows
    ]
    return "\n".join(lines)
