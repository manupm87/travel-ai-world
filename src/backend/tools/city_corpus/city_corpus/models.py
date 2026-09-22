"""The corpus document: one line of `documents.jsonl`, one point in the vector store.

The field set is the payload schema of ADR 0012; the listing extras (`alt`, `address`,
...) and the enrichment fields (`image_license`, `opening_hours`, ...) are optional
metadata the cards can show. `text` is what gets embedded.
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
    TOUR = "tour"


class Source(StrEnum):
    WIKIVOYAGE = "wikivoyage"
    WIKIPEDIA = "wikipedia"
    OPENSTREETMAP = "openstreetmap"
    OPEN_METEO = "open-meteo"
    CURATED = "curated"  # hand-maintained files in curated/, written in our own words


class Kind(StrEnum):
    LISTING = "listing"
    PROSE = "prose"


CC_BY_SA = "CC BY-SA 4.0"
ODBL = "ODbL 1.0"
CC_BY = "CC BY 4.0"


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
    # Enrichment (Wikidata, Commons, OpenStreetMap).
    entity_id: str | None = None
    name_es: str | None = None
    heritage: str | None = None
    image_license: str | None = None
    image_author: str | None = None
    # What to print beside a photo that is not from Commons (the hotel's own
    # site, its Facebook page): the bare domain it was read from (TRA-208).
    image_credit: str | None = None
    osm_id: str | None = None
    # The venue's Facebook page (OSM `contact:facebook`), a photo source.
    facebook: str | None = None
    opening_hours: str | None = None
    stars: str | None = None
    cuisine: str | None = None
    wheelchair: str | None = None
    # Tours: `tour_type` for every tour document; the rest for curated ones.
    tour_type: str | None = None
    operator: str | None = None
    start_times: list[str] | None = None
    days: str | None = None
    duration_minutes: int | None = None
    languages: list[str] | None = None
    price_model: str | None = None
    booking_required: bool | None = None
    checked: str | None = None
