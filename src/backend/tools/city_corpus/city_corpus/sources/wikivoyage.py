"""Wikivoyage: city and district guides → listing documents and prose chunks."""

import logging
import re
from dataclasses import dataclass

import mwparserfromhell as mw
from mwparserfromhell.nodes import Heading, Template
from mwparserfromhell.wikicode import Wikicode

from city_corpus.config.cities import CityConfig, WikivoyageSite
from city_corpus.http import ApiClient
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.normalize import (
    HEADING_SEPARATOR,
    MAX_CHUNK_TOKENS,
    chunk_paragraphs,
    clean_whitespace,
    estimate_tokens,
    inline,
    paragraphs,
    slugify,
    to_text,
    unique_ids,
    wiki_url,
)

logger = logging.getLogger(__name__)

SKIP = "skip"

# Top-level (== x ==) section → category, per wiki language. Unknown headings fall
# back to `practical`; `SKIP` sections (other destinations, references) are ignored.
SECTION_CATEGORIES: dict[str, dict[str, str]] = {
    "en": {
        "understand": Category.HISTORY,
        "history": Category.HISTORY,
        "climate": Category.CLIMATE,
        "districts": Category.NEIGHBOURHOOD,
        "orientation": Category.NEIGHBOURHOOD,
        "get in": Category.TRANSPORT,
        "get around": Category.TRANSPORT,
        "see": Category.SEE,
        "do": Category.DO,
        "buy": Category.DO,
        "eat": Category.EAT,
        "drink": Category.DRINK,
        "sleep": Category.SLEEP,
        "go next": SKIP,
        "see also": SKIP,
    },
    "es": {
        "comprender": Category.HISTORY,
        "entender": Category.HISTORY,
        "historia": Category.HISTORY,
        "clima": Category.CLIMATE,
        "distritos": Category.NEIGHBOURHOOD,
        "orientación": Category.NEIGHBOURHOOD,
        "llegar": Category.TRANSPORT,
        "circular": Category.TRANSPORT,
        "moverse": Category.TRANSPORT,
        "ver": Category.SEE,
        "hacer": Category.DO,
        "comprar": Category.DO,
        "comer": Category.EAT,
        "beber": Category.DRINK,
        "beber y salir": Category.DRINK,
        "salir": Category.DRINK,
        "dormir": Category.SLEEP,
        "destino siguiente": SKIP,
        "alrededores": SKIP,
        "véase también": SKIP,
        "referencias": SKIP,
    },
}
# Sub-headings that name a topic more precisely than their parent section.
SUBSECTION_OVERRIDES = {
    "history": Category.HISTORY,
    "historia": Category.HISTORY,
    "climate": Category.CLIMATE,
    "clima": Category.CLIMATE,
}

LISTING_TYPES: dict[str, Category | None] = {
    "see": Category.SEE,
    "ver": Category.SEE,
    "do": Category.DO,
    "hacer": Category.DO,
    "buy": Category.DO,
    "comprar": Category.DO,
    "eat": Category.EAT,
    "comer": Category.EAT,
    "drink": Category.DRINK,
    "beber": Category.DRINK,
    "sleep": Category.SLEEP,
    "dormir": Category.SLEEP,
    "go": Category.TRANSPORT,
    "ir": Category.TRANSPORT,
    # Generic templates take their category from `type=` or the section.
    "listing": None,
    "listado": None,
    "vcard": None,
}
PRICE_TIERS: tuple[tuple[re.Pattern[str], int], ...] = (
    (re.compile(r"\b(budget|económico|barato)\b", re.I), 1),
    (re.compile(r"\b(mid-?\s?range|medio|precio medio)\b", re.I), 2),
    (re.compile(r"\b(splurge|lujo|derrochar|caro)\b", re.I), 3),
)
PRICED_CATEGORIES = {Category.EAT, Category.DRINK, Category.SLEEP}
FACT_LABELS = {
    "en": {
        "address": "Address",
        "directions": "Directions",
        "hours": "Hours",
        "price": "Price",
        "checkin": "Check-in",
        "checkout": "Check-out",
    },
    "es": {
        "address": "Dirección",
        "directions": "Cómo llegar",
        "hours": "Horario",
        "price": "Precio",
        "checkin": "Entrada",
        "checkout": "Salida",
    },
}
MIN_SECTION_CHARS = 40
_WIKIDATA_RE = re.compile(r"^Q\d+$")


@dataclass(frozen=True)
class WikivoyagePage:
    lang: str
    title: str
    revision_id: int
    wikitext: str


@dataclass
class ParseStats:
    coordinates_outside_bbox: int = 0
    # No name, or nothing beyond name and heading (under MIN_SECTION_CHARS).
    listings_skipped: int = 0


def api_url(lang: str) -> str:
    return f"https://{lang}.wikivoyage.org/w/api.php"


def list_titles(client: ApiClient, site: WikivoyageSite) -> list[str]:
    if not site.include_subpages:
        return [site.root]
    titles: list[str] = []
    params: dict[str, str | int] = {
        "action": "query",
        "list": "allpages",
        "apprefix": site.root,
        "apnamespace": 0,
        "apfilterredir": "nonredirects",
        "aplimit": 500,
    }
    while True:
        data = client.get(api_url(site.lang), params).data
        titles += [p["title"] for p in data["query"]["allpages"]]
        cont = data.get("continue")
        if not cont:
            break
        params = {**params, **cont}
    wanted = [t for t in titles if t == site.root or t.startswith(site.root + "/")]
    return sorted(set(wanted))


def fetch_page(client: ApiClient, lang: str, title: str) -> tuple[WikivoyagePage, str]:
    fetched = client.get(
        api_url(lang),
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content|ids",
            "rvslots": "main",
            "redirects": 1,
            "titles": title,
        },
    )
    page = fetched.data["query"]["pages"][0]
    revision = page["revisions"][0]
    return (
        WikivoyagePage(
            lang=lang,
            title=page["title"],
            revision_id=revision["revid"],
            wikitext=revision["slots"]["main"]["content"],
        ),
        fetched.fetched_at,
    )


def _heading_text(heading: Heading) -> str:
    return inline(to_text(heading.title))


def _section_category(lang: str, path: list[str]) -> str:
    if not path:
        return Category.NEIGHBOURHOOD
    for heading in reversed(path[1:]):
        override = SUBSECTION_OVERRIDES.get(heading.lower())
        if override is not None:
            return override
    return SECTION_CATEGORIES.get(lang, {}).get(path[0].lower(), Category.PRACTICAL)


def _price_tier(category: Category, path: list[str]) -> int | None:
    if category not in PRICED_CATEGORIES:
        return None
    for heading in reversed(path):
        for pattern, tier in PRICE_TIERS:
            if pattern.search(heading):
                return tier
    return None


def _field(tpl: Template, *names: str) -> str | None:
    for name in names:
        if tpl.has(name):
            value = inline(to_text(tpl.get(name).value))
            if value:
                return value
    return None


def _coordinates(
    tpl: Template, city: CityConfig, stats: ParseStats
) -> tuple[float | None, float | None]:
    raw_lat = _field(tpl, "lat")
    raw_lon = _field(tpl, "long", "lon")
    if raw_lat is None or raw_lon is None:
        return None, None
    try:
        lat, lon = float(raw_lat), float(raw_lon)
    except ValueError:
        return None, None
    if not city.bbox.contains(lat, lon):
        stats.coordinates_outside_bbox += 1
        return None, None
    return round(lat, 6), round(lon, 6)


def parse_page(
    page: WikivoyagePage, city: CityConfig, stats: ParseStats | None = None
) -> list[CorpusDocument]:
    """Every listing template and every prose section of one guide page."""
    stats = stats if stats is not None else ParseStats()
    host = f"{page.lang}.wikivoyage.org"
    district = page.title.split("/", 1)[1] if "/" in page.title else None
    root_path = [city.name] if district is None else [city.name, district]
    labels = FACT_LABELS.get(page.lang, FACT_LABELS["en"])
    claim = unique_ids()
    documents: list[CorpusDocument] = []
    headings: list[tuple[int, str]] = []

    code = mw.parse(page.wikitext)
    for section in code.get_sections(flat=True, include_lead=True):
        first = section.nodes[0] if section.nodes else None
        if isinstance(first, Heading):
            level = first.level
            headings = [h for h in headings if h[0] < level]
            headings.append((level, _heading_text(first)))
        path = [text for _, text in headings]
        category = _section_category(page.lang, path)
        if category == SKIP:
            continue
        anchor = path[-1] if path else None
        source_url = wiki_url(host, page.title, anchor)
        heading_path = HEADING_SEPARATOR.join(root_path + path)
        common = {
            "city": city.slug,
            "district": district,
            "source": Source.WIKIVOYAGE,
            "source_url": source_url,
            "lang": page.lang,
            "heading_path": heading_path,
        }

        for tpl in section.filter_templates(recursive=False):
            name = str(tpl.name).strip().lower()
            if name not in LISTING_TYPES:
                continue
            listing = _listing(
                tpl, name, Category(category), path, heading_path, labels
            )
            if listing is None or len(str(listing[1]["text"])) < MIN_SECTION_CHARS:
                stats.listings_skipped += 1
                continue
            listing_name, fields = listing
            lat, lon = _coordinates(tpl, city, stats)
            doc_id = claim(
                f"wv:{page.lang}:{page.title}#{fields['category']}:"
                f"{slugify(listing_name)}"
            )
            documents.append(
                CorpusDocument(
                    doc_id=doc_id,
                    kind=Kind.LISTING,
                    name=listing_name,
                    lat=lat,
                    lon=lon,
                    **fields,
                    **common,
                )
            )

        body_nodes = section.nodes[1:] if isinstance(first, Heading) else section.nodes
        body = clean_whitespace(to_text(Wikicode(body_nodes)))
        if len(body) < MIN_SECTION_CHARS:
            continue
        section_slug = "/".join(slugify(h) for h in path) or "intro"
        budget = MAX_CHUNK_TOKENS - estimate_tokens(heading_path)
        chunks = chunk_paragraphs(paragraphs(body), max_tokens=budget)
        for index, chunk in enumerate(chunks, start=1):
            documents.append(
                CorpusDocument(
                    doc_id=claim(
                        f"wv:{page.lang}:{page.title}#section:{section_slug}:c{index}"
                    ),
                    kind=Kind.PROSE,
                    category=Category(category),
                    text=f"{heading_path}\n\n{chunk}",
                    **common,
                )
            )
    return documents


def _listing(
    tpl: Template,
    template_name: str,
    section_category: Category,
    path: list[str],
    heading_path: str,
    labels: dict[str, str],
) -> tuple[str, dict[str, object]] | None:
    listing_name = _field(tpl, "name", "nombre")
    if not listing_name:
        return None
    category = LISTING_TYPES[template_name]
    if category is None:
        declared = (_field(tpl, "type", "tipo") or "").lower()
        category = LISTING_TYPES.get(declared) or section_category
    alt = _field(tpl, "alt")
    content = _field(tpl, "content", "descripción", "description")
    facts = {key: _field(tpl, key) for key in labels}
    title = f"{listing_name} ({alt})" if alt else listing_name
    lines = [title, heading_path]
    if content:
        lines.append(content)
    details = [f"{labels[k]}: {v}" for k, v in facts.items() if v]
    if details:
        lines.append(". ".join(d.rstrip(".") for d in details) + ".")
    wikidata = _field(tpl, "wikidata")
    return listing_name, {
        "category": category,
        "text": "\n".join(lines),
        "alt": alt,
        "address": facts["address"],
        "directions": facts["directions"],
        "hours": facts["hours"],
        "price": facts["price"],
        "checkin": facts["checkin"],
        "checkout": facts["checkout"],
        "phone": _field(tpl, "phone"),
        "url": _url(_field(tpl, "url")),
        "image": _field(tpl, "image"),
        "wikidata": wikidata if wikidata and _WIKIDATA_RE.match(wikidata) else None,
        "price_tier": _price_tier(category, path),
    }


def _url(value: str | None) -> str | None:
    if value and re.match(r"^https?://", value):
        return value
    return None
