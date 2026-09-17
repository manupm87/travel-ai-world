"""Candidate B: Amazon S3 Vectors.

Filling it is part of the spike: the index is the one the throwaway stack owns,
never the one TRA-152 deploys, and it is filled from the same artefact as
Qdrant so the comparison is about the store.

The payload split is the one ADR 0014 froze at index creation: seven keys hold
what an answer shows (`text` above all) and everything a query filters on stays
filterable, which is also what keeps a document inside the 2 KB budget.
"""

import json
import logging
import uuid
from collections.abc import Sequence
from typing import Any

import numpy as np

from vector_store_bench.corpus import FILTERABLE, Document
from vector_store_bench.search import Hit

BATCH = 500  # PutVectors takes at most 500 vectors per call
NON_FILTERABLE = (
    "text",
    "doc_id",
    "name",
    "url",
    "source_url",
    "heading_path",
    "extra",
)
# Fields a card shows; they travel inside `extra` so they cost no filterable budget.
EXTRA_FIELDS = (
    "image_url",
    "image_license",
    "image_author",
    "address",
    "hours",
    "price",
    "operator",
    "start_times",
    "days",
    "duration_minutes",
    "languages",
    "booking_required",
    "opening_hours",
    "cuisine",
    "stars",
    "wheelchair",
    "phone",
    "alt",
)

logger = logging.getLogger(__name__)


def vector_key(doc_id: str) -> str:
    """ASCII, stable and idempotent: 1,357 doc_ids carry accents (ADR 0014)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, doc_id))


def metadata(document: Document) -> dict[str, Any]:
    payload: dict[str, Any] = {
        k: v for k, v in document.filterable().items() if k in FILTERABLE
    }
    extra = {
        key: value
        for key in EXTRA_FIELDS
        if (value := getattr(document, key, None)) is not None
    }
    payload |= {
        "doc_id": document.doc_id,
        "text": document.text,
        "name": document.name,
        "url": document.url,
        "source_url": document.source_url,
        "heading_path": document.heading_path,
    }
    if extra:
        payload["extra"] = json.dumps(extra, ensure_ascii=False)
    return {k: v for k, v in payload.items() if v is not None}


class S3VectorsStore:
    def __init__(self, bucket: str, index: str, client: Any = None) -> None:
        self.name = "s3vectors"
        self._bucket = bucket
        self._index = index
        if client is None:
            import boto3

            client = boto3.client("s3vectors")
        self._client = client

    def put(
        self,
        doc_ids: Sequence[str],
        vectors: np.ndarray,
        documents: dict[str, Document],
    ) -> int:
        written = 0
        for start in range(0, len(doc_ids), BATCH):
            stop = min(start + BATCH, len(doc_ids))
            self._client.put_vectors(
                vectorBucketName=self._bucket,
                indexName=self._index,
                vectors=[
                    {
                        "key": vector_key(doc_id),
                        "data": {"float32": vectors[i].tolist()},
                        "metadata": metadata(documents[doc_id]),
                    }
                    for i, doc_id in enumerate(doc_ids[start:stop], start=start)
                ],
            )
            written = stop
            logger.info("put %d/%d", written, len(doc_ids))
        return written

    def search(self, vector: np.ndarray, limit: int) -> list[Hit]:
        response = self._client.query_vectors(
            vectorBucketName=self._bucket,
            indexName=self._index,
            queryVector={"float32": vector.tolist()},
            topK=limit,
            returnMetadata=True,
            returnDistance=True,
        )
        return [
            Hit(v["metadata"]["doc_id"], 1.0 - float(v.get("distance", 0.0)))
            for v in response["vectors"]
        ]
