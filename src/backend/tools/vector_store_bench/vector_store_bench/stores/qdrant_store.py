"""Candidate A: Qdrant.

The same client talks to three things, which is exactly the point of this
candidate: an in-process store (no server, used for the quality numbers and the
tests), a Compose container, and the Qdrant-as-a-Lambda behind a Function URL
signed with SigV4. Only the constructor changes.
"""

from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np
from qdrant_client import QdrantClient, models

from vector_store_bench.search import Bm25Index, Hit, reciprocal_rank_fusion

COLLECTION = "city-kb"
DENSE = "dense"


class QdrantStore:
    """Dense search in Qdrant; hybrid fuses it with BM25 computed here.

    Qdrant can do sparse vectors and server-side fusion, but the spike keeps BM25
    in process so that candidate A and candidate B are fused by the same code and
    the difference measured is the vector search itself.
    """

    def __init__(self, client: QdrantClient, name: str = "qdrant") -> None:
        self.name = name
        self._client = client
        self._bm25: Bm25Index | None = None

    @classmethod
    def in_memory(cls, name: str = "qdrant-local") -> "QdrantStore":
        return cls(QdrantClient(":memory:"), name)

    @classmethod
    def on_disk(cls, path: Path, name: str = "qdrant-local") -> "QdrantStore":
        return cls(QdrantClient(path=str(path)), name)

    @classmethod
    def remote(
        cls, url: str, name: str = "qdrant-lambda", **kwargs: Any
    ) -> "QdrantStore":
        return cls(QdrantClient(url=url, **kwargs), name)

    def create(self, dimensions: int) -> None:
        if self._client.collection_exists(COLLECTION):
            self._client.delete_collection(COLLECTION)
        self._client.create_collection(
            collection_name=COLLECTION,
            vectors_config={
                DENSE: models.VectorParams(
                    size=dimensions, distance=models.Distance.COSINE
                )
            },
        )

    def index(
        self,
        doc_ids: Sequence[str],
        vectors: np.ndarray,
        payloads: Sequence[dict[str, Any]],
        *,
        batch_size: int = 500,
    ) -> int:
        """Upsert every document. Point ids are the position in the artefact; the
        `doc_id` travels in the payload, as in ADR 0014."""
        for start in range(0, len(doc_ids), batch_size):
            stop = start + batch_size
            self._client.upsert(
                collection_name=COLLECTION,
                points=models.Batch(
                    ids=list(range(start, min(stop, len(doc_ids)))),
                    vectors={DENSE: vectors[start:stop].tolist()},
                    payloads=list(payloads[start:stop]),
                ),
            )
        return len(doc_ids)

    def build_keyword_index(self, doc_ids: Sequence[str], texts: Sequence[str]) -> None:
        self._bm25 = Bm25Index(doc_ids, texts)

    def search(self, vector: np.ndarray, limit: int) -> list[Hit]:
        response = self._client.query_points(
            collection_name=COLLECTION,
            query=vector.tolist(),
            using=DENSE,
            limit=limit,
            with_payload=True,
        )
        return [
            Hit(str((point.payload or {}).get("doc_id", point.id)), float(point.score))
            for point in response.points
        ]

    def search_hybrid(self, vector: np.ndarray, text: str, limit: int) -> list[Hit]:
        if self._bm25 is None:
            raise RuntimeError("build_keyword_index() first")
        dense = self.search(vector, limit * 2)
        keyword = self._bm25.search(text, limit * 2)
        return reciprocal_rank_fusion([dense, keyword], limit)

    def close(self) -> None:
        self._client.close()
