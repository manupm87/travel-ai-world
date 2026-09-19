"""Hydrate an `OptionCard` — or the fuller `CardDetail` — from a `Document`.

Everything on a card but `why` is read straight from the corpus metadata
`indexing.metadata_for` built: the model only picks ids (via `title_of`) and
writes one short sentence, never a price or an address.

`detail_from_document` adds what the carousel has no room for and the detail
panel shows (TRA-178): the document's own text, the address, the phone and
the venue's site. Same rule — it all comes from the store, never the client.
"""

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any, cast

from ai_api.domain.models import Document, MetadataValue
from ai_api.schemas.planner import CardDetail
from ai_api.schemas.planner_events import MAX_WHY_CHARS, OptionCard, PriceTier

_SOURCE_NAMES: dict[str, str] = {
    "wikivoyage": "Wikivoyage",
    "wikipedia": "Wikipedia",
    "openstreetmap": "OpenStreetMap",
    "open-meteo": "Open-Meteo",
    "curated": "Travel AI World",
}

_LICENSE_DEFAULTS: dict[str, str] = {
    "wikivoyage": "CC BY-SA 4.0",
    "wikipedia": "CC BY-SA 4.0",
    "openstreetmap": "ODbL",
    "curated": "",
}

_MAX_HOURS_CHARS = 120
_MAX_STARS = 5
_HEADING_SEP = " › "  # noqa: RUF001 — the corpus's own separator

MAX_DESCRIPTION_CHARS = 1_500
"""How much of a document's text the detail panel gets: a few paragraphs."""

_SENTENCE_END = re.compile(r"[.!?…](?=\s|$)")
"""A full stop that ends a sentence rather than an abbreviation mid-word."""


def card_from_document(document: Document, why: str = "") -> OptionCard:
    """Build the card the browser shows for one retrieved document."""
    metadata = document.metadata
    extra = _extra(metadata)
    segments = _heading_segments(metadata)

    price_tier = _price_tier(metadata.get("price_tier"))
    image_url = _extra_str(extra, "image_url")
    source_key = _str(metadata.get("source")) or ""

    return OptionCard(
        id=document.id,
        title=_title(metadata, segments, document.id),
        subtitle=_subtitle(extra, segments),
        district=_str(metadata.get("district")),
        category=_str(metadata.get("category")) or "",
        image_url=image_url,
        image_credit=_image_credit(extra, image_url),
        price_tier=price_tier,
        rating_text=_rating_text(extra),
        hours=_hours(extra),
        lat=_float(metadata.get("lat")),
        lon=_float(metadata.get("lon")),
        why=_truncate_why(why),
        source=_source_display(source_key),
        source_url=_str(metadata.get("source_url")) or _str(metadata.get("url")) or "",
        license=_extra_str(extra, "license") or _LICENSE_DEFAULTS.get(source_key, ""),
        deep_link=_str(metadata.get("url")),
    )


def detail_from_document(document: Document, why: str = "") -> CardDetail:
    """The same card with the article behind it: text, address, phone, site.

    Built on `card_from_document`, so the detail panel and the carousel can
    never disagree about a title, a photo or a price tier.
    """
    card = card_from_document(document, why)
    metadata = document.metadata
    extra = _extra(metadata)

    return CardDetail(
        **card.model_dump(),
        description=_description(document.content),
        address=_extra_str(extra, "address"),
        phone=_extra_str(extra, "phone"),
        website=_website(metadata, extra, card.source_url),
        heading_path=_str(metadata.get("heading_path")),
    )


def cards_for(
    documents: Sequence[Document], whys: Mapping[str, str]
) -> list[OptionCard]:
    """One card per document, in the given order; `why` from the mapping."""
    return [card_from_document(doc, whys.get(doc.id, "")) for doc in documents]


def title_of(document: Document) -> str:
    """The name shown back to the model when it picks ids for a carousel."""
    segments = _heading_segments(document.metadata)
    return _title(document.metadata, segments, document.id)


# ─── metadata readers ─────────────────────────────────────────────────────


def _extra(metadata: Mapping[str, MetadataValue]) -> dict[str, Any]:
    """`extra` travels as a JSON string; a missing or malformed one is empty."""
    raw = metadata.get("extra")
    if not isinstance(raw, str) or not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _extra_str(extra: Mapping[str, Any], key: str) -> str | None:
    value = extra.get(key)
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _str(value: MetadataValue) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _float(value: MetadataValue) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _price_tier(value: MetadataValue) -> PriceTier | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if not float(value).is_integer():
        return None
    tier = int(value)
    return cast(PriceTier, tier) if tier in (1, 2, 3) else None


def _heading_segments(metadata: Mapping[str, MetadataValue]) -> list[str]:
    heading = _str(metadata.get("heading_path"))
    if not heading:
        return []
    return [
        segment.strip() for segment in heading.split(_HEADING_SEP) if segment.strip()
    ]


def _title(
    metadata: Mapping[str, MetadataValue], segments: list[str], doc_id: str
) -> str:
    return _str(metadata.get("name")) or (segments[-1] if segments else None) or doc_id


def _subtitle(extra: dict[str, Any], segments: list[str]) -> str | None:
    address = _extra_str(extra, "address")
    if address:
        return address
    cuisine = _extra_str(extra, "cuisine")
    if cuisine:
        return cuisine
    if len(segments) > 1:
        return _HEADING_SEP.join(segments[1:])
    return None


def _image_credit(extra: dict[str, Any], image_url: str | None) -> str | None:
    if not image_url:
        return None
    author = _extra_str(extra, "image_author")
    license_ = _extra_str(extra, "image_license")
    if author and license_:
        return f"{author} ({license_}) · Wikimedia Commons"
    if author:
        return f"{author} · Wikimedia Commons"
    if license_:
        return f"{license_} · Wikimedia Commons"
    return None


def _rating_text(extra: dict[str, Any]) -> str | None:
    stars = extra.get("stars")
    if isinstance(stars, bool) or not isinstance(stars, int | float):
        return None
    if not float(stars).is_integer():
        return None
    stars_int = int(stars)
    if 0 <= stars_int <= _MAX_STARS:
        return f"{stars_int}★"
    return None


def _hours(extra: dict[str, Any]) -> str | None:
    value = _extra_str(extra, "hours") or _extra_str(extra, "opening_hours")
    return value[:_MAX_HOURS_CHARS] if value else None


def _description(text: str) -> str:
    """The document's text, cut at the last sentence that still fits.

    Paragraph breaks are kept (the panel renders them); only the tail is
    dropped. A text with no sentence end inside the window is cut at a word
    and marked with an ellipsis, so the panel never shows half a word.
    """
    cleaned = text.strip()
    if len(cleaned) <= MAX_DESCRIPTION_CHARS:
        return cleaned
    window = cleaned[:MAX_DESCRIPTION_CHARS]
    ends = [match.end() for match in _SENTENCE_END.finditer(window)]
    if ends:
        return window[: ends[-1]].rstrip()
    cut = window.rstrip()
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip() + "…"


def _website(
    metadata: Mapping[str, MetadataValue], extra: Mapping[str, Any], source_url: str
) -> str | None:
    """The venue's own site. Corpora that have none point `url` at the page
    they were scraped from, and repeating the source there helps nobody."""
    url = _extra_str(extra, "url") or _str(metadata.get("url"))
    if not url or _same_page(url, source_url):
        return None
    return url


def _same_page(url: str, other: str) -> bool:
    return url.rstrip("/").casefold() == other.rstrip("/").casefold()


def _truncate_why(why: str) -> str:
    collapsed = re.sub(r"\s+", " ", why).strip()
    if len(collapsed) <= MAX_WHY_CHARS:
        return collapsed
    cut = collapsed[: MAX_WHY_CHARS - 1]
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip() + "…"


def _source_display(source_key: str) -> str:
    if not source_key:
        return ""
    known = _SOURCE_NAMES.get(source_key)
    if known:
        return known
    return source_key[0].upper() + source_key[1:]
