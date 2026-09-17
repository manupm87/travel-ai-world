"""Scoring shared by both candidates: exact dense search, BM25 and RRF fusion.

Exact search is the ground truth an approximate store is measured against; BM25
is the keyword half of hybrid search, which Qdrant does server-side and S3
Vectors cannot do at all.
"""

import math
import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import numpy as np

BM25_K1 = 1.2
BM25_B = 0.75
RRF_K = 60  # Cormack et al. 2009; also Qdrant's default
_TOKEN_RE = re.compile(r"[a-z0-9]+")


@dataclass(frozen=True)
class Hit:
    doc_id: str
    score: float


def tokenize(text: str) -> list[str]:
    """Accent-folded lowercase words: a query in Spanish about `Gellért` has to
    reach a document that writes it `Gellert`."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return _TOKEN_RE.findall(folded.lower())


def exact_search(
    matrix: np.ndarray, query: np.ndarray, limit: int, doc_ids: Sequence[str]
) -> list[Hit]:
    """Brute-force cosine over every vector (both sides are normalised, so the
    dot product is the cosine)."""
    scores = matrix @ query
    top = np.argsort(-scores, kind="stable")[:limit]
    return [Hit(doc_ids[int(i)], float(scores[int(i)])) for i in top]


class Bm25Index:
    """Plain BM25 over the documents' text, built once and queried in process."""

    def __init__(self, doc_ids: Sequence[str], texts: Iterable[str]) -> None:
        self.doc_ids = list(doc_ids)
        self._frequencies: list[Counter[str]] = []
        self._lengths: list[int] = []
        postings: dict[str, int] = {}
        for text in texts:
            tokens = tokenize(text)
            counts = Counter(tokens)
            self._frequencies.append(counts)
            self._lengths.append(len(tokens))
            for token in counts:
                postings[token] = postings.get(token, 0) + 1
        self._documents = len(self._frequencies)
        self._average_length = (
            sum(self._lengths) / self._documents if self._documents else 0.0
        )
        self._idf = {
            token: math.log(1 + (self._documents - n + 0.5) / (n + 0.5))
            for token, n in postings.items()
        }

    def search(self, query: str, limit: int) -> list[Hit]:
        tokens = [t for t in tokenize(query) if t in self._idf]
        if not tokens:
            return []
        scored: list[Hit] = []
        for index, counts in enumerate(self._frequencies):
            score = 0.0
            for token in tokens:
                frequency = counts.get(token, 0)
                if not frequency:
                    continue
                norm = 1 - BM25_B + BM25_B * self._lengths[index] / self._average_length
                score += (
                    self._idf[token]
                    * frequency
                    * (BM25_K1 + 1)
                    / (frequency + BM25_K1 * norm)
                )
            if score:
                scored.append(Hit(self.doc_ids[index], score))
        scored.sort(key=lambda hit: (-hit.score, hit.doc_id))
        return scored[:limit]


def reciprocal_rank_fusion(
    rankings: Sequence[Sequence[Hit]], limit: int, k: int = RRF_K
) -> list[Hit]:
    """Merge rankings by 1/(k + rank); the scores of each list never meet, so
    dense cosine and BM25 magnitudes do not have to be comparable."""
    fused: dict[str, float] = {}
    for ranking in rankings:
        for rank, hit in enumerate(ranking, start=1):
            fused[hit.doc_id] = fused.get(hit.doc_id, 0.0) + 1 / (k + rank)
    order = sorted(fused.items(), key=lambda item: (-item[1], item[0]))
    return [Hit(doc_id, score) for doc_id, score in order[:limit]]
