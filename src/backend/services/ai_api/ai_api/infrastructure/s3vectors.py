"""What the two sides of the vector store share: the client, the keys and the
shape of a document's metadata (ADR 0014).

`indexing` writes and `s3vectors_retriever` reads, but both have to agree on
how a corpus document becomes a vector — and both have to agree with
`infra/aws/vectors.tf`, which freezes the non-filterable keys when the index
is created. Keep the three in step.
"""

import uuid
from typing import Any, Protocol, cast

import boto3
from botocore.config import Config

from ai_api.config import AISettings

# Small values a search narrows by. They count against a 2 KB budget per
# vector, which the Budapest corpus uses under 200 B of. Only the
# non-filterable list is frozen by the index, so a key can join this one
# without recreating anything: `tour_type` and `price_model` (TRA-154) did, so
# "free tours" and "boat tours" are a filter rather than a hope.
FILTERABLE_KEYS = (
    "city",
    "category",
    "district",
    "kind",
    "lang",
    "source",
    "price_tier",
    "lat",
    "lon",
    "tour_type",
    "price_model",
)

# What an answer shows but never filters on. Fixed when the index is created
# and limited to ten, so `extra` carries anything a card may want later
# (images and their licence, address, hours, price, tour details) as JSON.
NON_FILTERABLE_KEYS = (
    "text",
    "doc_id",
    "name",
    "url",
    "source_url",
    "heading_path",
    "extra",
)

_KEY_NAMESPACE = uuid.NAMESPACE_URL


class S3VectorsClient(Protocol):
    """The five operations we use; boto3's `s3vectors` client satisfies it."""

    def put_vectors(self, **kwargs: Any) -> Any: ...

    def query_vectors(self, **kwargs: Any) -> Any: ...

    def get_vectors(self, **kwargs: Any) -> Any: ...

    def list_vectors(self, **kwargs: Any) -> Any: ...

    def delete_vectors(self, **kwargs: Any) -> Any: ...


def build_client(settings: AISettings) -> S3VectorsClient:
    """The process-wide client. Credentials come from the environment: the
    function's role in AWS, the SSO session on a laptop."""
    config = Config(
        region_name=settings.VECTOR_REGION,
        connect_timeout=settings.BEDROCK_CONNECT_TIMEOUT,
        read_timeout=settings.BEDROCK_READ_TIMEOUT,
        retries={"mode": "standard", "total_max_attempts": 3},
    )
    # boto3 builds clients at runtime; the Protocol is the static contract.
    return cast(S3VectorsClient, boto3.client("s3vectors", config=config))


def vector_key(doc_id: str) -> str:
    """The key a document is stored under.

    Not the `doc_id` itself: a fifth of ours carry accents (`wv:en:Andrássy
    út#...`). This is ASCII, stable across runs — so re-indexing overwrites
    instead of duplicating — and the `doc_id` travels in the metadata.
    """
    return str(uuid.uuid5(_KEY_NAMESPACE, doc_id))
