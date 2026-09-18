"""S3VectorsRetriever against a fake `s3vectors` client: no network, no credentials."""

from typing import Any

import pytest
from ai_api.config import AISettings
from ai_api.domain.models import Document, RetrievalFilters
from ai_api.infrastructure.providers import build_retriever
from ai_api.infrastructure.s3vectors import vector_key
from ai_api.infrastructure.s3vectors_retriever import (
    UPSTREAM_ERROR_MESSAGE,
    S3VectorsRetriever,
    build_filter,
)
from ai_api.testing import FakeEmbedder
from botocore.exceptions import ClientError
from travel_common.exceptions import ProviderUnavailable

GELLERT = {
    "key": "3b6f0c0e-0000-5000-8000-000000000001",
    "distance": 0.559,
    "metadata": {
        "doc_id": "wv:en:Budapest/South Buda#do:gellert-baths",
        "text": "Gellért Baths. Art Nouveau thermal baths.",
        "name": "Gellért Baths",
        "category": "do",
        "district": "South Buda",
        "source_url": "https://en.wikivoyage.org/wiki/Budapest/South_Buda",
    },
}


class FakeClient:
    def __init__(self, vectors: list[dict[str, Any]] | None = None, error=None):
        self.vectors = vectors or []
        self.error = error
        self.queries: list[dict[str, Any]] = []
        self.gets: list[dict[str, Any]] = []

    def query_vectors(self, **kwargs: Any) -> Any:
        self.queries.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"vectors": self.vectors, "distanceMetric": "cosine"}

    def get_vectors(self, **kwargs: Any) -> Any:
        self.gets.append(kwargs)
        if self.error is not None:
            raise self.error
        return {"vectors": self.vectors}


def _retriever(client: FakeClient, embedder: FakeEmbedder | None = None):
    return S3VectorsRetriever(
        client=client,  # pyright: ignore[reportArgumentType] -- only the reads
        embedder=embedder or FakeEmbedder(),
        bucket="bucket",
        index="index",
    )


async def test_embeds_the_question_and_queries_the_index():
    client = FakeClient([GELLERT])
    embedder = FakeEmbedder()

    await _retriever(client, embedder).search("baths in Buda", limit=3)

    [query] = client.queries
    assert embedder.calls == ["baths in Buda"]
    assert query == {
        "vectorBucketName": "bucket",
        "indexName": "index",
        "queryVector": {"float32": await FakeEmbedder().embed_query("baths in Buda")},
        "topK": 3,
        "returnMetadata": True,
        "returnDistance": True,
    }


async def test_a_match_becomes_a_document_with_its_metadata_and_distance():
    [document] = await _retriever(FakeClient([GELLERT])).search("baths")

    assert document == Document(
        id="wv:en:Budapest/South Buda#do:gellert-baths",
        content="Gellért Baths. Art Nouveau thermal baths.",
        metadata={
            "doc_id": "wv:en:Budapest/South Buda#do:gellert-baths",
            "name": "Gellért Baths",
            "category": "do",
            "district": "South Buda",
            "source_url": "https://en.wikivoyage.org/wiki/Budapest/South_Buda",
            "distance": 0.559,
        },
    )


async def test_nothing_found_is_an_empty_list():
    assert await _retriever(FakeClient([])).search("nothing") == []


async def test_filters_travel_with_the_query():
    client = FakeClient()

    await _retriever(client).search("q", filters=RetrievalFilters(city="budapest"))

    assert client.queries[0]["filter"] == {"city": {"$eq": "budapest"}}


async def test_a_store_failure_is_a_domain_error_without_the_upstream_detail():
    error = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "arn:aws:..."}},
        "QueryVectors",
    )

    with pytest.raises(ProviderUnavailable) as info:
        await _retriever(FakeClient(error=error)).search("q")

    assert info.value.message == UPSTREAM_ERROR_MESSAGE
    assert "arn:aws" not in str(info.value)


def test_no_filters_means_no_filter():
    assert build_filter(RetrievalFilters()) is None


def test_one_condition_is_sent_bare():
    """A single condition needs no `$and`."""
    assert build_filter(RetrievalFilters(categories=("see", "do"))) == {
        "category": {"$in": ["see", "do"]}
    }


def test_several_conditions_are_wrapped_in_and():
    """S3 Vectors rejects two keys side by side (`Invalid filter`)."""
    filters = RetrievalFilters(
        city="budapest",
        districts=("Belváros", "Terézváros"),
        kinds=("listing",),
        price_tier_max=2,
        bbox=(47.49, 19.03, 47.51, 19.06),
    )

    assert build_filter(filters) == {
        "$and": [
            {"city": {"$eq": "budapest"}},
            {"district": {"$in": ["Belváros", "Terézváros"]}},
            {"kind": {"$in": ["listing"]}},
            {"price_tier": {"$lte": 2}},
            {"lat": {"$gte": 47.49}},
            {"lat": {"$lte": 47.51}},
            {"lon": {"$gte": 19.03}},
            {"lon": {"$lte": 19.06}},
        ]
    }


def test_retrieval_off_builds_no_retriever():
    assert build_retriever(AISettings(RETRIEVAL_ENABLED=False)) is None


def test_retrieval_on_builds_one_for_the_configured_index():
    retriever = build_retriever(
        AISettings(RETRIEVAL_ENABLED=True, VECTOR_BUCKET="b", VECTOR_INDEX="i")
    )

    assert isinstance(retriever, S3VectorsRetriever)
    assert (retriever._bucket, retriever._index) == ("b", "i")


FETCHED = {"key": GELLERT["key"], "metadata": GELLERT["metadata"]}


async def test_fetch_asks_for_the_keys_the_ids_are_stored_under():
    client = FakeClient([FETCHED])
    doc_id = "wv:en:Budapest/South Buda#do:gellert-baths"

    [document] = await _retriever(client).fetch([doc_id])

    assert client.gets == [
        {
            "vectorBucketName": "bucket",
            "indexName": "index",
            "keys": [vector_key(doc_id)],
            "returnMetadata": True,
        }
    ]
    # The card is hydrated from the store: text and id come back, not the key.
    assert document.id == doc_id
    assert document.content == "Gellért Baths. Art Nouveau thermal baths."
    assert "text" not in document.metadata


async def test_fetch_asks_for_every_id_once():
    client = FakeClient([FETCHED])

    await _retriever(client).fetch(["a", "b", "a", "b", "c"])

    assert client.gets[0]["keys"] == [vector_key(i) for i in ("a", "b", "c")]


async def test_fetch_splits_long_selections_into_batches_of_a_hundred():
    """GetVectors takes at most 100 keys per call."""
    client = FakeClient([])

    await _retriever(client).fetch([f"doc-{n}" for n in range(250)])

    assert [len(call["keys"]) for call in client.gets] == [100, 100, 50]


async def test_fetching_nothing_asks_nothing():
    client = FakeClient([FETCHED])

    assert await _retriever(client).fetch([]) == []
    assert client.gets == []


async def test_a_fetch_failure_is_a_domain_error_without_the_upstream_detail():
    error = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "arn:aws:..."}},
        "GetVectors",
    )

    with pytest.raises(ProviderUnavailable) as info:
        await _retriever(FakeClient(error=error)).fetch(["a"])

    assert info.value.message == UPSTREAM_ERROR_MESSAGE
    assert "arn:aws" not in str(info.value)
