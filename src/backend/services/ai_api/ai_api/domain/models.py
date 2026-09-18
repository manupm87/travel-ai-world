"""Pure domain types. No framework imports."""

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

ChatRole = Literal["system", "user", "assistant"]
"""Who speaks in a chat turn (not to be confused with a user's account Role)."""


@dataclass(frozen=True, slots=True)
class Message:
    role: ChatRole
    content: str


MetadataValue = str | float | int | bool | None
"""What a store keeps beside a vector: names, links, coordinates, tiers."""


@dataclass(frozen=True, slots=True)
class Document:
    """A retrieved passage that can ground an answer (RAG)."""

    id: str
    content: str
    metadata: dict[str, MetadataValue] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class RetrievalFilters:
    """Narrows a search to part of the corpus; every field left out widens it.

    `bbox` is `(min_lat, min_lon, max_lat, max_lon)`: the store compares
    coordinates, it has no radius search (ADR 0014).
    """

    city: str | None = None
    districts: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
    kinds: tuple[str, ...] = ()
    price_tier_max: int | None = None
    bbox: tuple[float, float, float, float] | None = None


@dataclass(slots=True)
class Usage:
    """What a provider reports about one answer; adapters fill what they know."""

    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(slots=True)
class ChatTrace:
    """What one answer was built from, filled in while it streams."""

    documents: list[Document] = field(default_factory=list)
    usage: Usage = field(default_factory=Usage)


@dataclass(frozen=True, slots=True)
class Source:
    """A document an answer was grounded on, as a conversation keeps it."""

    doc_id: str
    title: str | None = None
    url: str | None = None


@dataclass(frozen=True, slots=True)
class ChatTurn:
    """One message of a recorded conversation (ADR 0013)."""

    role: Literal["user", "assistant"]
    content: str
    sources: tuple[Source, ...] = ()
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    latency_ms: int | None = None


@dataclass(frozen=True, slots=True)
class ThreadSaved:
    """Stream event: the exchange was recorded in this conversation."""

    thread_id: str


@dataclass(frozen=True, slots=True)
class DayWeather:
    """One day's weather as a forecast or a climate normal describes it."""

    day: date
    summary: str
    t_max: float | None
    t_min: float | None
    source: str


@dataclass(frozen=True, slots=True)
class RouteSuggestion:
    """How to get there: a prefilled search, never a price or a time."""

    origin: str
    destination: str
    origin_iata: str | None
    destination_iata: str | None
    deep_link: str


@dataclass(frozen=True, slots=True)
class GenerationParams:
    """Sampling settings handed to whichever provider answers."""

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.95
