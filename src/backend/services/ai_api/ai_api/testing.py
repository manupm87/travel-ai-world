"""Test doubles for the ports. Shipped with the package so any consumer's
tests (and this service's own) can run without a network or an API key."""

import hashlib
import math
import re
import uuid
from collections import Counter
from collections.abc import AsyncIterator, Sequence
from pathlib import Path

from travel_common.exceptions import DomainError, EntityNotFound

from ai_api.config import AISettings
from ai_api.domain.models import (
    ChatTurn,
    City,
    Document,
    Message,
    Photo,
    RetrievalFilters,
    Usage,
)
from ai_api.domain.tracing import TurnTrace


def settings_for_tests() -> AISettings:
    return AISettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min")  # noqa: S106


def city_for(
    slug: str,
    *aliases: str,
    name: str | None = None,
    country: str = "Nowhere",
    country_code: str = "NO",
) -> City:
    """A `City` for a test or a smoke run: `city_for("bologna", "bolonia")`."""
    return City(
        slug=slug,
        name=name or slug.replace("-", " ").title(),
        aliases=tuple(dict.fromkeys((slug, *aliases))),
        centre=(0.0, 0.0),
        timezone="UTC",
        country=country,
        country_code=country_code,
    )


BUDAPEST = city_for("budapest", name="Budapest")


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


WORDS = re.compile(r"[^\W\d_]+")
"""Runs of letters in any script; digits and underscores are not words."""

MIN_QUERY_WORD = 3
"""Shorter query words (articles, prepositions) carry no signal."""


class KeywordRetriever:
    """A retriever over a corpus file with no embeddings: term-frequency
    scoring (tf-idf) on each document's content, filters honoured like the
    store does. Enough to drive the planner's prompts against a whole city
    without AWS, which is what the smoke session (`tests/manual/`) needs; the
    order of equally scored documents is the corpus's own, so ordering
    pictured candidates first stays the caller's job.
    """

    def __init__(self, documents: Sequence[Document]) -> None:
        self.documents = list(documents)
        self._terms = [
            Counter(WORDS.findall(d.content.lower())) for d in self.documents
        ]
        frequency: Counter[str] = Counter()
        for terms in self._terms:
            frequency.update(terms.keys())
        total = len(self.documents)
        self._idf = {w: math.log(1 + total / (1 + n)) for w, n in frequency.items()}
        self.searches: list[tuple[str, int, RetrievalFilters | None]] = []

    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        filters: RetrievalFilters | None = None,
    ) -> list[Document]:
        self.searches.append((query, limit, filters))
        words = [w for w in WORDS.findall(query.lower()) if len(w) >= MIN_QUERY_WORD]
        scored: list[tuple[float, int]] = []
        for index, (document, terms) in enumerate(
            zip(self.documents, self._terms, strict=True)
        ):
            if filters is not None and not matches(document, filters):
                continue
            score = sum(
                self._idf.get(w, 0.0) * (1 + math.log(terms[w]))
                for w in words
                if w in terms
            )
            scored.append((score, index))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [self.documents[index] for _, index in scored[:limit]]

    async def fetch(self, ids: Sequence[str]) -> list[Document]:
        wanted = set(ids)
        return [d for d in self.documents if d.id in wanted]


class FakePhotoFinder:
    """Answers one photo per place it knows (by name), records every lookup."""

    def __init__(
        self,
        photos: dict[str, Photo] | None = None,
        pages: dict[str, Photo] | None = None,
    ) -> None:
        self.photos = photos or {}
        self.pages = pages or {}
        self.lookups: list[tuple[str, float, float]] = []
        self.page_lookups: list[str] = []
        # The city name each lookup was asked for, in lookup order.
        self.cities: list[str] = []

    async def find(
        self, name: str, lat: float, lon: float, *, city: str
    ) -> Photo | None:
        self.lookups.append((name, lat, lon))
        self.cities.append(city)
        return self.photos.get(name)

    async def find_for_page(self, page_url: str) -> Photo | None:
        self.page_lookups.append(page_url)
        return self.pages.get(page_url)


class FakeSitePreviews:
    """Answers one photo per site it knows (by URL), records every lookup."""

    def __init__(self, previews: dict[str, Photo] | None = None) -> None:
        self.previews = previews or {}
        self.lookups: list[str] = []

    async def preview(self, site_url: str) -> Photo | None:
        self.lookups.append(site_url)
        return self.previews.get(site_url)


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


class InMemoryTraceLog:
    """Keeps every recorded trace in `traces`; `fail_with` makes it raise."""

    def __init__(self, fail_with: Exception | None = None) -> None:
        self.traces: list[TurnTrace] = []
        self.fail_with = fail_with

    async def record(self, trace: TurnTrace) -> None:
        if self.fail_with is not None:
            raise self.fail_with
        self.traces.append(trace)
