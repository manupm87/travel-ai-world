"""The corpus document: one line of `documents.jsonl`, one point in the vector store.

The field set is the payload schema of ADR 0012; the listing extras (`alt`, `address`,
...) are optional metadata the cards can show. `text` is what gets embedded.
"""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class Category(StrEnum):
    SEE = "see"
    DO = "do"
    EAT = "eat"
    DRINK = "drink"
    SLEEP = "sleep"
    PRACTICAL = "practical"
    HISTORY = "history"
    TRANSPORT = "transport"
    CLIMATE = "climate"
    NEIGHBOURHOOD = "neighbourhood"


class Source(StrEnum):
    WIKIVOYAGE = "wikivoyage"
    WIKIPEDIA = "wikipedia"


class Kind(StrEnum):
    LISTING = "listing"
    PROSE = "prose"


CC_BY_SA = "CC BY-SA 4.0"


class CorpusDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    doc_id: str
    city: str
    district: str | None = None
    category: Category
    kind: Kind
    name: str | None = None
    text: str
    heading_path: str
    lat: float | None = None
    lon: float | None = None
    hours: str | None = None
    price: str | None = None
    price_tier: int | None = None
    url: str | None = None
    image_url: str | None = None
    wikidata: str | None = None
    source: Source
    source_url: str
    license: str = CC_BY_SA
    lang: str
    # Listing extras (Wikivoyage listing templates).
    alt: str | None = None
    address: str | None = None
    directions: str | None = None
    phone: str | None = None
    checkin: str | None = None
    checkout: str | None = None
    image: str | None = None
