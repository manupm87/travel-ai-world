"""Retriever adapter over Amazon S3 Vectors (ADR 0014).

A question is embedded with the same model the corpus was indexed with and the
store returns the nearest passages, with the metadata an answer cites. There is
no endpoint and no key: boto3 signs the call with the process's credentials,
the function's role in AWS and the SSO session on a laptop.

Dense search only. The store has no keyword scoring to fuse and no radius
search, so a neighbourhood is filtered by name and a map area by a bounding box
on the coordinates.

boto3 is synchronous: the call runs in a worker thread through
`asyncio.to_thread`, leaving the event loop free while the store answers.
"""

import asyncio
import logging
from collections.abc import Sequence
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError
from travel_common.exceptions import ProviderUnavailable

from ai_api.config import AISettings
from ai_api.domain.models import Document, RetrievalFilters
from ai_api.domain.ports import Embedder
from ai_api.infrastructure.s3vectors import S3VectorsClient, build_client, vector_key

logger = logging.getLogger(__name__)

# What the browser sees. The store's codes and messages stay in the logs.
UPSTREAM_ERROR_MESSAGE = "Vector store error"

# Keys per GetVectors call, the API's maximum.
FETCH_BATCH_SIZE = 100


class S3VectorsRetriever:
    def __init__(
        self,
        *,
        client: S3VectorsClient,
        embedder: Embedder,
        bucket: str,
        index: str,
    ) -> None:
        self._client = client
        self._embedder = embedder
        self._bucket = bucket
        self._index = index

    @classmethod
    def from_settings(
        cls, settings: AISettings, embedder: Embedder
    ) -> "S3VectorsRetriever":
        return cls(
            client=build_client(settings),
            embedder=embedder,
            bucket=settings.VECTOR_BUCKET,
            index=settings.VECTOR_INDEX,
        )

    async def aclose(self) -> None:
        """boto3 clients hold nothing that needs closing; here for symmetry."""
        return None

    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        filters: RetrievalFilters | None = None,
    ) -> list[Document]:
        vector = await self._embedder.embed_query(query)
        request: dict[str, Any] = {
            "vectorBucketName": self._bucket,
            "indexName": self._index,
            "queryVector": {"float32": vector},
            "topK": limit,
            "returnMetadata": True,
            "returnDistance": True,
        }
        condition = build_filter(filters) if filters is not None else None
        if condition is not None:
            request["filter"] = condition

        try:
            response = await asyncio.to_thread(self._client.query_vectors, **request)
        except (ClientError, BotoCoreError) as exc:
            logger.error("Vector search failed: %s", exc)
            raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc

        documents = [_document(vector) for vector in response.get("vectors", [])]
        # The ids and how close they matched, never the question itself: enough
        # to tell a bad answer from a bad retrieval in CloudWatch.
        logger.info(
            "Retrieved %d passages: %s",
            len(documents),
            ", ".join(f"{d.id}@{d.metadata.get('distance')}" for d in documents[:5]),
        )
        return documents

    async def fetch(self, ids: Sequence[str]) -> list[Document]:
        """The documents behind these ids (GetVectors by key), unknown ones left out.

        Keys are derived from the ids the way `indexing` stores them, so a
        card the client selected is hydrated from the store, never from the
        client.
        """
        documents: list[Document] = []
        unique = list(dict.fromkeys(ids))
        for start in range(0, len(unique), FETCH_BATCH_SIZE):
            batch = unique[start : start + FETCH_BATCH_SIZE]
            try:
                response = await asyncio.to_thread(
                    self._client.get_vectors,
                    vectorBucketName=self._bucket,
                    indexName=self._index,
                    keys=[vector_key(doc_id) for doc_id in batch],
                    returnMetadata=True,
                )
            except (ClientError, BotoCoreError) as exc:
                logger.error("Vector fetch failed: %s", exc)
                raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
            documents.extend(_document(v) for v in response.get("vectors", []))
        return documents


def build_filter(filters: RetrievalFilters) -> dict[str, Any] | None:
    """Translate the domain's filters into a metadata filter.

    Two keys side by side are rejected (`Invalid filter`), so anything beyond a
    single condition is wrapped in `$and`. A document missing the key a
    condition names is left out, which is why coordinates only ever narrow
    listings that have them.
    """
    conditions: list[dict[str, Any]] = []
    if filters.city:
        conditions.append({"city": {"$eq": filters.city}})
    if filters.districts:
        conditions.append({"district": {"$in": list(filters.districts)}})
    if filters.categories:
        conditions.append({"category": {"$in": list(filters.categories)}})
    if filters.kinds:
        conditions.append({"kind": {"$in": list(filters.kinds)}})
    if filters.price_tier_max is not None:
        conditions.append({"price_tier": {"$lte": filters.price_tier_max}})
    if filters.bbox is not None:
        min_lat, min_lon, max_lat, max_lon = filters.bbox
        conditions.append({"lat": {"$gte": min_lat}})
        conditions.append({"lat": {"$lte": max_lat}})
        conditions.append({"lon": {"$gte": min_lon}})
        conditions.append({"lon": {"$lte": max_lon}})

    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def _document(found: dict[str, Any]) -> Document:
    """One result as the use cases see it: the passage and everything about it.

    `text` becomes the content and the rest stays in the metadata, `distance`
    included, so a caller can weigh how close a match was.
    """
    metadata = dict(found.get("metadata") or {})
    content = str(metadata.pop("text", ""))
    doc_id = str(metadata.get("doc_id") or found["key"])
    if "distance" in found:
        metadata["distance"] = found["distance"]
    return Document(id=doc_id, content=content, metadata=metadata)
