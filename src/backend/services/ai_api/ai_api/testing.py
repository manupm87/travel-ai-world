"""Test doubles for the ports. Shipped with the package so any consumer's
tests (and this service's own) can run without a network or an API key."""

import hashlib
import math
import uuid
from collections.abc import AsyncIterator, Sequence
from pathlib import Path

from travel_common.exceptions import DomainError, EntityNotFound

from ai_api.config import AISettings
from ai_api.domain.models import (
    ChatTurn,
    Document,
    Message,
    RetrievalFilters,
    Usage,
)


def settings_for_tests() -> AISettings:
    return AISettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")  # noqa: S106


class FakeProvider:
    """Records what it was asked and answers from a script.

    `stream` yields `deltas`; `complete` pops the next entry of `replies`
    (a JSON string for structured output) and falls back to the joined
    deltas when the script runs out. Every call is kept in `calls` /
    `completions`, so a test can assert what the model was shown.
    """

    name = "fake"

    def __init__(
        self,
        deltas: Sequence[str] = ("Hola", " mundo"),
        usage: Usage | None = None,
        replies: Sequence[str] = (),
    ) -> None:
        self.deltas = list(deltas)
        self.usage = usage or Usage(model="fake-model", input_tokens=3, output_tokens=2)
        self.calls: list[list[Message]] = []
        self.replies = list(replies)
        self.completions: list[list[Message]] = []

    async def stream(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> AsyncIterator[str]:
        self.calls.append(list(messages))
        for delta in self.deltas:
            yield delta
        self._fill(usage)

    async def complete(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> str:
        self.completions.append(list(messages))
        self._fill(usage)
        if self.replies:
            return self.replies.pop(0)
        return "".join(self.deltas)

    def _fill(self, usage: Usage | None) -> None:
        if usage is not None:
            usage.model = self.usage.model
            usage.input_tokens = self.usage.input_tokens
            usage.output_tokens = self.usage.output_tokens


class FakeConversations:
    """An in-memory core_api for conversations; `fail_with` makes every call raise."""

    def __init__(self, fail_with: DomainError | None = None) -> None:
        self.threads: dict[str, list[ChatTurn]] = {}
        self.tokens: list[str] = []
        self.fail_with = fail_with

    async def start_thread(self, bearer_token: str) -> str:
        self._check(bearer_token)
        thread_id = str(uuid.UUID(int=len(self.threads) + 1))
        self.threads[thread_id] = []
        return thread_id

    async def append_turn(
        self, bearer_token: str, thread_id: str, turn: ChatTurn
    ) -> None:
        self._check(bearer_token)
        if thread_id not in self.threads:
            raise EntityNotFound("Chat thread", thread_id)
        self.threads[thread_id].append(turn)

    def _check(self, bearer_token: str) -> None:
        self.tokens.append(bearer_token)
        if self.fail_with is not None:
            raise self.fail_with


class FakeEmbedder:
    """Deterministic unit vectors from a hash of the text: equal texts get
    equal vectors, and each call reports one token per word."""

    def __init__(self, dimensions: int = 8, model_id: str = "fake-embedder") -> None:
        self._dimensions = dimensions
        self._model_id = model_id
        self.calls: list[str] = []

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed_query(
        self, text: str, *, usage: Usage | None = None
    ) -> list[float]:
        return self._embed(text, usage)

    async def embed_documents(
        self, texts: Sequence[str], *, usage: Usage | None = None
    ) -> list[list[float]]:
        return [self._embed(text, usage) for text in texts]

    def _embed(self, text: str, usage: Usage | None) -> list[float]:
        self.calls.append(text)
        if usage is not None:
            usage.model = self._model_id
            usage.input_tokens = (usage.input_tokens or 0) + len(text.split())
        digest = hashlib.sha256(text.encode()).digest()
        raw = [digest[i % len(digest)] - 127.5 for i in range(self._dimensions)]
        norm = math.sqrt(sum(x * x for x in raw))
        return [x / norm for x in raw]


class FakeRetriever:
    """Returns canned passages and records every search; `fail_with` makes
    each search raise instead.

    Filters are honoured the way the store does it (a document without the
    key a condition names is left out), so a planner test over a corpus
    sample sees the same narrowing as production. The order is the
    documents' own; there is no similarity.
    """

    def __init__(
        self,
        documents: Sequence[Document] = (),
        fail_with: DomainError | None = None,
    ) -> None:
        self.documents = list(documents)
        self.fail_with = fail_with
        self.searches: list[tuple[str, int, RetrievalFilters | None]] = []
        self.fetches: list[list[str]] = []

    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        filters: RetrievalFilters | None = None,
    ) -> list[Document]:
        self.searches.append((query, limit, filters))
        if self.fail_with is not None:
            raise self.fail_with
        if filters is None:
            return self.documents[:limit]
        return [d for d in self.documents if matches(d, filters)][:limit]

    async def fetch(self, ids: Sequence[str]) -> list[Document]:
        self.fetches.append(list(ids))
        if self.fail_with is not None:
            raise self.fail_with
        wanted = set(ids)
        return [d for d in self.documents if d.id in wanted]


def matches(document: Document, filters: RetrievalFilters) -> bool:
    """Whether the store would return this document under these filters."""
    m = document.metadata
    if filters.city and m.get("city") != filters.city:
        return False
    if filters.districts and m.get("district") not in filters.districts:
        return False
    if filters.categories and m.get("category") not in filters.categories:
        return False
    if filters.kinds and m.get("kind") not in filters.kinds:
        return False
    if filters.price_tier_max is not None:
        tier = m.get("price_tier")
        if not isinstance(tier, int | float) or tier > filters.price_tier_max:
            return False
    if filters.bbox is not None:
        lat, lon = m.get("lat"), m.get("lon")
        if not isinstance(lat, int | float) or not isinstance(lon, int | float):
            return False
        min_lat, min_lon, max_lat, max_lon = filters.bbox
        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
            return False
    return True


def documents_from_corpus(path: Path, *, limit: int | None = None) -> list[Document]:
    """Corpus JSONL lines as the retriever would return them.

    Goes through `indexing.metadata_for`, so a document carries exactly the
    metadata the store keeps (`extra` as JSON, `text` as the content), and a
    test over a corpus sample exercises the same hydration as production.
    """
    from ai_api.indexing import metadata_for, read_corpus

    documents: list[Document] = []
    for corpus_document in read_corpus(path, limit=limit):
        metadata = metadata_for(corpus_document)
        content = str(metadata.pop("text", ""))
        documents.append(
            Document(id=corpus_document.doc_id, content=content, metadata=metadata)
        )
    return documents
