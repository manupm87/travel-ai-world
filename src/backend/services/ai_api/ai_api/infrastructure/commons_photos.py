"""PhotoFinder adapter over the Wikimedia Commons API.

Most restaurants, bars and hotels in the corpus come from OpenStreetMap and
carry no picture. Commons knows where its photos were taken, which narrows the
search to the right town — but only a file whose title carries the venue's own
name is a picture of that venue; the one taken next door is the street. Up to
three calls per lookup: a full-text `search` for the venue's name (many photos
are named after the place but carry no geotag), else a `geosearch` in the File
namespace around the point — matched by name all the same — then `imageinfo`
for the author and the licence the credit line needs.

Every photo on Commons is licence-clean by construction; the credit still has
to name the author and the licence, which is what `Photo.credit` carries.
A lookup that fails for any reason answers None: the caller falls back.
"""

import html
import logging
import re
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx

from ai_api.config import AISettings
from ai_api.domain.models import Photo

logger = logging.getLogger(__name__)

# Commons asks API clients to identify themselves.
USER_AGENT = "travel-ai-world/0.1 (https://github.com/manupm87/travel-ai-world)"

RADIUS_M = 60
"""How far from the coordinates a photo may have been taken."""

RESULTS = 10

# Words that name nothing on their own: a title holding one of them is not
# evidence that the photo shows the venue.
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

# Files that are not a picture of a place, whatever their coordinates.
SKIP_WORDS = re.compile(
    r"plaque|tábla|relief|mosaic|chasuble|manuscript|map|plan of|panel|"
    r"grave|tomb|coin|medal|statue detail|inscription|drawing|logo",
    re.IGNORECASE,
)

_TAGS = re.compile(r"<[^>]+>")
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


class CommonsPhotos:
    name = "wikimedia-commons"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        api_url: str = "https://commons.wikimedia.org/w/api.php",
        width: int = 800,
    ) -> None:
        self._client = client
        self._api_url = api_url
        self._width = width

    @classmethod
    def from_settings(cls, settings: AISettings) -> "CommonsPhotos":
        timeout = httpx.Timeout(
            connect=settings.COMMONS_TIMEOUT,
            read=settings.COMMONS_TIMEOUT,
            write=5.0,
            pool=5.0,
        )
        client = httpx.AsyncClient(timeout=timeout, headers={"User-Agent": USER_AGENT})
        return cls(client, api_url=settings.COMMONS_API_URL)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def find(
        self, name: str, lat: float, lon: float, *, city: str
    ) -> Photo | None:
        title = await self._by_name(name, city)
        try:
            if title is None:
                files = await self._geosearch(lat, lon)
                title = choose_file(name, files, city=city)
            if title is None:
                return None
            author, licence = await self._credit(title)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Commons photo lookup failed for %r: %s", name, exc)
            return None
        return Photo(
            url=file_url(title, self._width), credit=credit_line(author, licence)
        )

    async def find_for_page(self, page_url: str) -> Photo | None:
        """The lead image (`pageimages`) of a Wikivoyage or Wikipedia page."""
        located = wiki_page(page_url)
        if located is None:
            return None
        host, title = located
        try:
            response = await self._client.get(
                f"https://{host}/w/api.php",
                params={
                    "action": "query",
                    "titles": title,
                    "prop": "pageimages",
                    "piprop": "name",
                    "format": "json",
                },
            )
            response.raise_for_status()
            pages: Mapping[str, Any] = response.json()["query"]["pages"]
            filename = next(
                (p.get("pageimage") for p in pages.values() if p.get("pageimage")),
                None,
            )
            if not isinstance(filename, str):
                return None
            file_title = f"File:{filename.replace('_', ' ')}"
            author, licence = await self._credit(file_title)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Wiki page image lookup failed for %r: %s", page_url, exc)
            return None
        return Photo(
            url=file_url(file_title, self._width), credit=credit_line(author, licence)
        )

    async def _by_name(self, name: str, city: str) -> str | None:
        """A file named after the venue, or None; a failed search (Commons
        rate-limits this endpoint) still leaves the geosearch to try. The
        city's name narrows the search to the right town's venue."""
        if not distinctive_words(name, city=city):
            return None
        try:
            response = await self._client.get(
                self._api_url,
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": f"{name} {city}".strip(),
                    "srnamespace": 6,
                    "srlimit": 5,
                    "format": "json",
                },
            )
            response.raise_for_status()
            found = [
                {"title": hit.get("title")}
                for hit in response.json()["query"]["search"]
            ]
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Commons name search failed for %r: %s", name, exc)
            return None
        return choose_named(name, found, city=city)

    async def _geosearch(self, lat: float, lon: float) -> list[dict[str, Any]]:
        response = await self._client.get(
            self._api_url,
            params={
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{lat}|{lon}",
                "gsradius": RADIUS_M,
                "gsnamespace": 6,
                "gslimit": RESULTS,
                "format": "json",
            },
        )
        response.raise_for_status()
        return list(response.json()["query"]["geosearch"])

    async def _credit(self, title: str) -> tuple[str | None, str | None]:
        response = await self._client.get(
            self._api_url,
            params={
                "action": "query",
                "titles": title,
                "prop": "imageinfo",
                "iiprop": "extmetadata",
                "iiextmetadatafilter": "Artist|LicenseShortName",
                "format": "json",
            },
        )
        response.raise_for_status()
        pages: Mapping[str, Any] = response.json()["query"]["pages"]
        for page in pages.values():
            info = (page.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            return _plain(meta.get("Artist", {}).get("value")), _plain(
                meta.get("LicenseShortName", {}).get("value")
            )
        return None, None


WIKI_HOSTS = re.compile(r"^[a-z]{2,3}\.(wikivoyage|wikipedia)\.org$")


def wiki_page(page_url: str) -> tuple[str, str] | None:
    """`(host, title)` of a Wikivoyage/Wikipedia article URL, else None.

    A section anchor is dropped: the page's lead image is what a district or
    an article is pictured by.
    """
    parsed = urlparse(page_url)
    if not WIKI_HOSTS.match(parsed.hostname or "") or not parsed.path.startswith(
        "/wiki/"
    ):
        return None
    title = unquote(parsed.path[len("/wiki/") :]).replace("_", " ")
    return (parsed.hostname or "", title) if title else None


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


def _usable(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        f
        for f in files
        if isinstance(f.get("title"), str)
        and f["title"].startswith("File:")
        and not SKIP_WORDS.search(f["title"])
        and f["title"].lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ]


def choose_named(
    name: str, files: list[dict[str, Any]], *, city: str = ""
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


def choose_file(
    name: str, files: list[dict[str, Any]], *, city: str = ""
) -> str | None:
    """The file near the venue that names it, or none at all.

    A title with one of the venue's own words (Szimpla, Náncsi) is the venue.
    Proximity alone proves nothing: the nearest photo is as likely to be the
    street, the neighbours' façade or a passing tram, and a card showing the
    wrong place is worse than a card showing none.
    """
    skip = _STOP | _city_words(city)
    words = {w.lower() for w in _NAME_WORDS.findall(name) if w.lower() not in skip}
    for f in _usable(files):
        lowered = f["title"].lower()
        if any(w in lowered for w in words):
            return str(f["title"])
    return None


def file_url(title: str, width: int) -> str:
    """The rendered file at a fixed width; the redirect target never changes."""
    filename = title.removeprefix("File:")
    return (
        "https://commons.wikimedia.org/wiki/Special:FilePath/"
        f"{quote(filename)}?width={width}"
    )


def credit_line(author: str | None, licence: str | None) -> str:
    parts = [p for p in (author, f"({licence})" if licence else None) if p]
    return " ".join([*parts, "· Wikimedia Commons"]) if parts else "Wikimedia Commons"


def _plain(value: object) -> str | None:
    """Commons returns the artist as HTML; keep the text, cut to a name."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = html.unescape(_TAGS.sub("", value)).strip()
    return text[:80] or None
