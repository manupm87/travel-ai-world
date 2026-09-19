"""Ports: what the use cases need from the outside world.

Adapters in `infrastructure/` implement these; tests substitute fakes.
"""

from collections.abc import AsyncIterator, Sequence
from datetime import date
from typing import Any, Protocol

from ai_api.domain.models import (
    ChatTurn,
    DayWeather,
    Document,
    Message,
    Photo,
    RetrievalFilters,
    Usage,
)


class LLMProvider(Protocol):
    def stream(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> AsyncIterator[str]:
        """Yield text deltas. Raise `ProviderUnavailable` when the upstream fails.

        When `usage` is given, fill in the model and the token counts the
        upstream reports, by the time the stream ends.
        """
        ...

    async def complete(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> str:
        """One whole answer, not streamed: what structured output is parsed from.

        Same failure and `usage` rules as `stream`. `application.structured`
        turns it into a validated model with a repair retry.
        """
        ...


class Embedder(Protocol):
    """Turns text into the vectors a store compares.

    One model embeds both sides of a search, so a question and a passage end
    up in the same space. Raises `ProviderUnavailable` when the upstream fails.
    When `usage` is given, the input tokens the upstream bills are added to it.
    """

    @property
    def model_id(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed_query(
        self, text: str, *, usage: Usage | None = None
    ) -> list[float]: ...

    async def embed_documents(
        self, texts: Sequence[str], *, usage: Usage | None = None
    ) -> list[list[float]]: ...


class Retriever(Protocol):
    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        filters: RetrievalFilters | None = None,
    ) -> list[Document]: ...

    async def fetch(self, ids: Sequence[str]) -> list[Document]:
        """The documents with these ids, in no particular order; unknown ids
        are left out. How a card the client selected is hydrated again."""
        ...


class WeatherForecast(Protocol):
    """A daily forecast for a place and a range of dates.

    Returns nothing (an empty list) when the dates are beyond the forecast
    horizon or the upstream fails: the caller falls back to climate normals.
    Never raises for a weather problem.
    """

    async def daily(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[DayWeather]: ...


class PhotoFinder(Protocol):
    """A picture of a named place at these coordinates, or None.

    Never raises for a lookup problem: a card without a photo is worse than
    one with, but a plan without cards is worse than both.
    """

    async def find(
        self, name: str, lat: float, lon: float, *, city: str
    ) -> Photo | None:
        """A photo of the venue `name` at these coordinates; `city` is the
        city's name, which a name search adds to tell venues apart."""
        ...

    async def find_for_page(self, page_url: str) -> Photo | None:
        """The lead image of a wiki page (a Wikivoyage district, a Wikipedia
        article) given its URL, or None."""
        ...


class TripGateway(Protocol):
    """The slice of core_api the AI service needs, acting as the caller."""

    async def create_trip(
        self, bearer_token: str, trip: dict[str, Any]
    ) -> dict[str, Any]: ...


class ConversationGateway(Protocol):
    """Where the chat keeps its conversations: core_api, acting as the caller.

    Raises `EntityNotFound` / `Forbidden` for a thread the caller cannot use
    and `ProviderUnavailable` when core_api cannot be reached (ADR 0013).
    """

    async def start_thread(self, bearer_token: str) -> str: ...

    async def append_turn(
        self, bearer_token: str, thread_id: str, turn: ChatTurn
    ) -> None: ...
