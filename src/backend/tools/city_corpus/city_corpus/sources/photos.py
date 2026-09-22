"""Every hotel gets a photo, or leaves the corpus (TRA-208, ADR 0022).

A hotel card with no picture is the worst card the planner shows: the traveller
is asked to sleep somewhere they cannot see. Most hotels come from OpenStreetMap
with a website and nothing else, so this stage resolves a photo for every located
`sleep` document that has none, in order of how well the image shows the hotel:

1. **The hotel's own site preview** (`og:image`): the picture the hotel chose of
   itself, what every chat and search engine shows for a link to it, credited
   with the site's bare domain.
2. **Its Facebook page** (OSM `contact:facebook`): the page's own `og:image`.
3. **Wikimedia Commons**, by name only — licence-clean and credited to its
   author, but a file is the hotel only when its title says so: a photo merely
   taken near the coordinates is the street, not the room you would book.
4. **The largest picture on its homepage**, when the site publishes no preview.

What is still unpictured is dropped: about a third of the hotel sites in a city
are dead (DNS, timeout, parked), and the planner would rather offer fewer stays
than a blank card.

The Commons matching rules (`distinctive_words`, `choose_named` and the
generic-word list) are a deliberate twin of
`ai_api/infrastructure/commons_photos.py`, which does the same lookup live for
restaurants and bars (there still around the coordinates, but never without a
name match); the site rules are the twin of
`ai_api/infrastructure/site_previews.py` (ADR 0021, TRA-206/207). The tool never
imports a service, so the two copies are kept in step by hand — change one, read
the other.

Every fetch goes through `ApiClient`, so `--offline` works and a rebuild with a
warm cache is byte-identical. No lookup raises: a hotel whose site times out is
a hotel without a photo.
"""

import html
import ipaddress
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient, CacheMiss, FetchedPage
from city_corpus.models import Category, CorpusDocument
from city_corpus.sources import wikidata

logger = logging.getLogger(__name__)

COMMONS_API = wikidata.COMMONS_API
SEARCH_RESULTS = 5

DROPPED_SHOWN = 10
"""How many names of dropped hotels the manifest and the report carry."""

# ─── Commons by name: the twin of ai_api/infrastructure/commons_photos.py ────

GENERIC_WORDS = frozenset(
    {
        "park",
        "house",
        "green",
        "grand",
        "royal",
        "central",
        "square",
        "market",
        "garden",
        "corner",
        "little",
        "small",
        "old",
        "new",
        "city",
        "castle",
        "palace",
        "bridge",
        "river",
        "station",
        "plaza",
        "place",
        "food",
        "wine",
        "beer",
        "coffee",
        "kitchen",
        "chop",
        "pizza",
        "pizzeria",
        "burger",
        "sushi",
        "grill",
        "terrace",
        "hungarian",
        "magyar",
    }
)
"""Words that name nothing on their own: a file title holding one of them is no
evidence that the photo shows this hotel."""

SKIP_WORDS = re.compile(
    r"plaque|tábla|relief|mosaic|chasuble|manuscript|map|plan of|panel|"
    r"grave|tomb|coin|medal|statue detail|inscription|drawing|logo",
    re.IGNORECASE,
)
"""Files that are not a picture of a place, whatever their coordinates."""

_NAME_WORDS = re.compile(r"[a-záéíóúöőüűñ]{4,}", re.IGNORECASE)
_STOP = frozenset(
    {
        "restaurant",
        "étterem",
        "bar",
        "pub",
        "café",
        "cafe",
        "kávéház",
        "hotel",
        "hostel",
        "kitchen",
        "house",
        "street",
        "utca",
        "bistro",
        "bisztró",
        "vendéglő",
        "söröző",
    }
)

# ─── The venue's own site: the twin of ai_api/infrastructure/site_previews.py ─

DENIED_HOSTS = (
    "wikipedia.org",
    "wikivoyage.org",
    "wikimedia.org",
    "wikidata.org",
    "openstreetmap.org",
)
"""Never the hotel's own site: their preview pictures the encyclopaedia."""

PRIVATE_SUFFIXES = (".local", ".internal")
SECOND_LEVEL = frozenset({"co", "com", "org", "net", "gov", "edu", "ac"})
"""Under a two-letter country code these are not the site (`co.uk`, `com.br`)."""

MIN_PREVIEW_BYTES = 15_000
"""Below this a "preview" is a favicon, a badge or a tiny logo, not a picture."""

MIN_PAGE_IMAGE_BYTES = 40_000
"""A picture taken from the page's markup has nothing vouching for it but its
size, so the bar is higher and an image that states no size does not clear it."""

MAX_PAGE_CANDIDATES = 5
"""How many pictures of a homepage are checked with a `HEAD`."""

LOGO_PATH = re.compile(r"logo|icon|favicon|sprite", re.IGNORECASE)
PAGE_IMAGE_SKIP = re.compile(
    r"logo|icon|sprite|flag|badge|payment|tripadvisor|booking|placeholder|"
    r"blank|pixel|loading|avatar",
    re.IGNORECASE,
)
IMAGE_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".avif")

SECURE_URL = "og:image:secure_url"
META_RANKS = {SECURE_URL: 0, "og:image": 1, "twitter:image": 2, "twitter:image:src": 3}
IMAGE_SRC_RANK = 4
"""`<link rel="image_src">`: the oldest of the conventions, the last choice."""

FACEBOOK_CREDIT = "facebook.com"


@dataclass
class PhotoStats:
    """What the stage did, for the manifest and the readiness report."""

    site: int = 0
    facebook: int = 0
    commons: int = 0
    page: int = 0
    dropped: int = 0
    dropped_names: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "site": self.site,
            "facebook": self.facebook,
            "commons": self.commons,
            "page": self.page,
            "dropped": self.dropped,
            "dropped_examples": sorted(self.dropped_names)[:DROPPED_SHOWN],
        }


@dataclass(frozen=True)
class Found:
    source: str  # site | facebook | commons | page
    fields: dict[str, str | None]


def needs_photo(doc: CorpusDocument) -> bool:
    """A stay the planner could offer and no one can see."""
    return (
        doc.category == Category.SLEEP
        and not doc.image_url
        and doc.lat is not None
        and doc.lon is not None
    )


def resolve(
    client: ApiClient, city: CityConfig, documents: Sequence[CorpusDocument]
) -> tuple[list[CorpusDocument], PhotoStats]:
    """The same documents, every located `sleep` one pictured or gone."""
    stats = PhotoStats()
    kept: list[CorpusDocument] = []
    for doc in documents:
        if not needs_photo(doc):
            kept.append(doc)
            continue
        found = find(client, city, doc)
        if found is None:
            stats.dropped += 1
            stats.dropped_names.append(doc.name or doc.doc_id)
            logger.info("dropping %s: no photo anywhere", doc.doc_id)
            continue
        setattr(stats, found.source, getattr(stats, found.source) + 1)
        logger.info("%s: photo from %s", doc.doc_id, found.source)
        kept.append(doc.model_copy(update=found.fields))
    return kept, stats


def find(client: ApiClient, city: CityConfig, doc: CorpusDocument) -> Found | None:
    """The first photo of this hotel any of the four sources answers with."""
    finders = (
        ("site", _from_site),
        ("facebook", _from_facebook),
        ("commons", _from_commons),
        ("page", _from_page),
    )
    for source, finder in finders:
        try:
            fields = finder(client, city, doc)
        except CacheMiss:
            raise
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, TypeError) as exc:
            logger.warning("%s photo lookup failed for %s: %s", source, doc.doc_id, exc)
            continue
        if fields:
            return Found(source=source, fields=fields)
    return None


# ─── 3. Wikimedia Commons, by name only ──────────────────────────────────────


def _from_commons(
    client: ApiClient, city: CityConfig, doc: CorpusDocument
) -> dict[str, str | None] | None:
    name = doc.name or ""
    if not name:
        return None
    title = _search_by_name(client, name, city.name)
    if title is None:
        return None
    filename = title.removeprefix("File:")
    info = wikidata.fetch_image_info(client, [filename]).get(
        wikidata.commons_title(filename)
    )
    if info is None or not wikidata.is_free(info.licence):
        return None
    return {
        "image_url": wikidata.thumbnail_url(filename),
        "image_license": info.licence,
        "image_author": info.author,
    }


def _search_by_name(client: ApiClient, name: str, city_name: str) -> str | None:
    """A file named after the hotel; the city narrows it to the right town.

    The only Commons question worth asking: a file the hotel's name is written
    on. Coordinates are not evidence — the photo next door is the street.
    """
    if not distinctive_words(name, city=city_name):
        return None
    data = client.get(
        COMMONS_API,
        {
            "action": "query",
            "list": "search",
            "srsearch": f"{name} {city_name}".strip(),
            "srnamespace": 6,
            "srlimit": SEARCH_RESULTS,
        },
    ).data
    hits = [
        {"title": hit.get("title")} for hit in data.get("query", {}).get("search", [])
    ]
    return choose_named(name, hits, city=city_name)


def _city_words(city: str) -> set[str]:
    """The city's own name is never distinctive of a venue in it."""
    return {w.lower() for w in _NAME_WORDS.findall(city)}


def distinctive_words(name: str, *, city: str = "") -> set[str]:
    """The words of a venue name that could only mean this venue."""
    skip = _STOP | GENERIC_WORDS | _city_words(city)
    return {
        w.lower()
        for w in _NAME_WORDS.findall(name)
        if len(w) >= 5 and w.lower() not in skip
    }


def _usable(files: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        f
        for f in files
        if isinstance(f.get("title"), str)
        and f["title"].startswith("File:")
        and not SKIP_WORDS.search(f["title"])
        and f["title"].lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]


def choose_named(
    name: str, files: Sequence[dict[str, Any]], *, city: str = ""
) -> str | None:
    """A search result whose title carries a distinctive word of the name, or
    the whole name; search results are not near the venue, so nothing less."""
    words = distinctive_words(name, city=city)
    whole = " ".join(name.lower().split())
    for f in _usable(files):
        lowered = f["title"].lower()
        if whole in lowered or any(w in lowered for w in words):
            return str(f["title"])
    return None


# ─── 1, 2 and 4. The hotel's own site, its Facebook page, its homepage ───────


def _from_site(
    client: ApiClient, city: CityConfig, doc: CorpusDocument
) -> dict[str, str | None] | None:
    return _preview(client, doc.url)


def _from_facebook(
    client: ApiClient, city: CityConfig, doc: CorpusDocument
) -> dict[str, str | None] | None:
    return _preview(client, doc.facebook, credit=FACEBOOK_CREDIT)


def _from_page(
    client: ApiClient, city: CityConfig, doc: CorpusDocument
) -> dict[str, str | None] | None:
    """The largest picture the homepage shows, when it publishes no preview."""
    page = _page(client, doc.url)
    if page is None:
        return None
    candidates: list[str] = []
    for raw in page_images(page.text):
        image = absolute_image(page.final_url, raw)
        if image is None or not _looks_like_a_photo(image) or image in candidates:
            continue
        candidates.append(image)
        if len(candidates) == MAX_PAGE_CANDIDATES:
            break
    for image in candidates:
        if _is_a_picture(client, image, MIN_PAGE_IMAGE_BYTES, trust_unstated=False):
            return {"image_url": image, "image_credit": credit_for(page.final_url)}
    return None


def _preview(
    client: ApiClient, site_url: str | None, *, credit: str | None = None
) -> dict[str, str | None] | None:
    """The link preview the page publishes for itself (ADR 0021)."""
    page = _page(client, site_url)
    if page is None:
        return None
    candidate = best_candidate(page.text)
    if candidate is None:
        return None
    image = absolute_image(page.final_url, candidate)
    if image is None or LOGO_PATH.search(urlsplit(image).path):
        return None
    if not _is_a_picture(client, image, MIN_PREVIEW_BYTES, trust_unstated=True):
        return None
    return {"image_url": image, "image_credit": credit or credit_for(page.final_url)}


def _page(client: ApiClient, site_url: str | None) -> FetchedPage | None:
    """The HTML behind a venue's URL, or None. Every redirect stays on the same
    registrable domain: a hotel whose domain now sends you elsewhere is parked,
    sold or gone, and its new owner's picture is not the hotel."""
    if not site_url or not fetchable(site_url):
        return None
    page = client.get_text(
        site_url, lambda hop: fetchable(hop) and same_site(site_url, hop)
    )
    return page if page.is_html and page.text else None


def _is_a_picture(
    client: ApiClient, image: str, minimum: int, *, trust_unstated: bool
) -> bool:
    """One `HEAD`: a raster image of a picture's size. Parked domains, logos in
    SVG and 5 KB badges all declare an `og:image`; the headers tell them from a
    photo. A server that answers no `HEAD` (405) or states no length is trusted
    only where something else vouches for the image."""
    head = client.head(image, fetchable)
    if head.status == 405:  # "method not allowed", not a size
        return trust_unstated
    if not 200 <= head.status < 300:
        return False
    content_type = head.content_type.lower()
    if not content_type.startswith("image/") or "svg" in content_type:
        return False
    if head.content_length is None:
        return trust_unstated
    return head.content_length >= minimum


def _looks_like_a_photo(image: str) -> bool:
    path = urlsplit(image).path.lower()
    return path.endswith(IMAGE_SUFFIXES) and not PAGE_IMAGE_SKIP.search(path)


def fetchable(site_url: str) -> bool:
    """Whether this URL may be requested at all — checked before any request.

    Only plain http(s) to a public named host: no credentials in the URL, no
    IP literal, no host of the local network, and none of the encyclopaedias
    that are never the venue's own site.
    """
    try:
        parsed = urlsplit(site_url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or not host:
            return False
        if parsed.username or parsed.password:
            return False
    except ValueError:
        return False
    if host == "localhost" or "." not in host or host.endswith(PRIVATE_SUFFIXES):
        return False
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        return False
    return not any(
        host == denied or host.endswith(f".{denied}") for denied in DENIED_HOSTS
    )


def registrable_domain(host: str) -> str:
    """`www.hotel.co.uk` → `hotel.co.uk`, `all.accor.com` → `accor.com`.

    Good enough without the public suffix list: two labels, or three when the
    second is a generic word under a country code."""
    labels = host.lower().removeprefix("www.").split(".")
    if len(labels) >= 3 and labels[-2] in SECOND_LEVEL and len(labels[-1]) == 2:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def same_site(site_url: str, other_url: str) -> bool:
    first = urlsplit(site_url).hostname or ""
    second = urlsplit(other_url).hostname or ""
    return registrable_domain(first) == registrable_domain(second)


def credit_for(final_url: str) -> str:
    """The site's bare domain: `hotelgellert.hu`, printed beside the photo."""
    host = (urlsplit(final_url).hostname or "").lower()
    return host.removeprefix("www.")


def absolute_image(final_url: str, candidate: str) -> str | None:
    """The candidate as an absolute https URL, or None when it is neither.

    A site served over https that advertises its preview over http would be
    blocked as mixed content, and every such image answers on https too.
    """
    try:
        parsed = urlsplit(urljoin(final_url, html.unescape(candidate.strip())))
    except ValueError:
        return None
    if parsed.scheme == "http":
        parsed = parsed._replace(scheme="https")
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return urlunsplit(parsed)


class _PreviewParser(HTMLParser):
    """The best link-preview candidate of a page's `<head>`.

    `og:image:secure_url` beats `og:image` beats `twitter:image` beats
    `twitter:image:src` beats `<link rel="image_src">`; between equals the
    first one wins. Nothing after `</head>` is looked at.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.best: tuple[int, str] | None = None
        self._done = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if self._done:
            return
        values = {name.lower(): (value or "") for name, value in attrs}
        if tag == "meta":
            key = (values.get("property") or values.get("name") or "").strip().lower()
            rank = META_RANKS.get(key)
            if rank is not None:
                self._offer(rank, values.get("content", ""))
        elif tag == "link":
            rels = values.get("rel", "").lower().split()
            if "image_src" in rels:
                self._offer(IMAGE_SRC_RANK, values.get("href", ""))

    def handle_endtag(self, tag: str) -> None:
        if tag == "head":
            self._done = True

    def _offer(self, rank: int, value: str) -> None:
        candidate = value.strip()
        if not candidate:
            return
        if self.best is None or rank < self.best[0]:
            self.best = (rank, candidate)


def best_candidate(html_text: str) -> str | None:
    """The preview image the page declares, as written, or None."""
    parser = _PreviewParser()
    parser.feed(html_text)
    parser.close()
    return parser.best[1] if parser.best else None


_MARKUP_IMAGE = re.compile(
    r"<img\b[^>]*>|background-image\s*:\s*url\(([^)]*)\)", re.IGNORECASE
)
_ATTRIBUTE = re.compile(
    r"""\b(src|data-src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""",
    re.IGNORECASE,
)


def page_images(html_text: str) -> list[str]:
    """Every picture the markup points at, in document order.

    `<img src>`, its lazy-loading twin `data-src`, the first URL of a
    `srcset`, and the CSS `background-image` of a hero section — which is how
    half the hotel sites in a city show their best photo.
    """
    found: list[str] = []
    for match in _MARKUP_IMAGE.finditer(html_text):
        if match.group(1) is not None:
            found.append(match.group(1).strip().strip("\"'"))
            continue
        attributes: dict[str, str] = {}
        for attribute in _ATTRIBUTE.finditer(match.group(0)):
            name = attribute.group(1).lower()
            value = next(g for g in attribute.groups()[1:] if g is not None)
            attributes.setdefault(name, value.strip())
        for key in ("src", "data-src"):
            if attributes.get(key):
                found.append(attributes[key])
        srcset = attributes.get("srcset", "")
        first = srcset.split(",")[0].strip().split(" ")[0] if srcset else ""
        if first:
            found.append(first)
    return [f for f in found if f]
