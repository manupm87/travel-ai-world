"""PhotoFinder adapter over the Wikimedia Commons API.

Most restaurants, bars and hotels in the corpus come from OpenStreetMap and
carry no picture. Commons knows where its photos were taken, which narrows the
search to the right town — but only a file whose title carries the venue's own
name is a picture of that venue; the one taken next door is the street. Up to
three calls per lookup: a full-text `search` for the venue's name (many photos
are named after the place but carry no geotag), else a `geosearch` in the File
namespace around the point — matched by name all the same — then `imageinfo`
for the author and the licence the credit line needs, with `coordinates`
alongside: a file found by name must also have been taken at the venue, since
a title says which hotel but not which town's (TRA-208).

How a title is read as a name is the strict business of `choose_named`, shared
word for word with the corpus tool's `sources/photos.py` (TRA-208): a search
result that merely shares a word with the venue is a ship, a flower or a
footballer far more often than it is the venue.

Every photo on Commons is licence-clean by construction; the credit still has
to name the author and the licence, which is what `Photo.credit` carries.
A lookup that fails for any reason answers None: the caller falls back.
"""

import html
import logging
import math
import re
import unicodedata
from collections.abc import Mapping, Sequence
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

_TAGS = re.compile(r"<[^>]+>")


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
            described: Mapping[str, Any] = {}
            if title is not None:
                # A file found by name has said nothing about where it was
                # taken, and a title says which hotel but not which town's
                # (TRA-208). A file found by `geosearch` was picked for being
                # here, so it is asked nothing more.
                described = await self._describe(title)
                if not taken_near(described, lat, lon):
                    logger.info("%r: %s was not photographed here", name, title)
                    title = None
            if title is None:
                files = await self._geosearch(lat, lon)
                title = choose_file(name, files, city=city)
                if title is None:
                    return None
                described = await self._describe(title)
            author, licence = credit_of(described)
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

    async def _describe(self, title: str) -> Mapping[str, Any]:
        """The file's author and licence, and where it was taken — one call:
        `coordinates` rides along with `imageinfo` at no extra request."""
        response = await self._client.get(
            self._api_url,
            params={
                "action": "query",
                "titles": title,
                "prop": "imageinfo|coordinates",
                "iiprop": "extmetadata",
                "iiextmetadatafilter": "Artist|LicenseShortName",
                "format": "json",
            },
        )
        response.raise_for_status()
        described: Mapping[str, Any] = response.json()
        return described

    async def _credit(self, title: str) -> tuple[str | None, str | None]:
        return credit_of(await self._describe(title))


def credit_of(data: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """The author and licence of the file a `prop=imageinfo` answer describes."""
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values() if isinstance(pages, dict) else pages:
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


# ─── Reading a Commons file title as a venue's name ──────────────────────────
# Everything from here to `choose_named` is shared, word for word, between
#   tools/city_corpus/city_corpus/sources/photos.py
#   services/ai_api/ai_api/infrastructure/commons_photos.py
# The tool never imports a service, so the two copies are kept in step by hand:
# change one, change the other.

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
"""Words that name nothing on their own: a title holding one of them is no
evidence that the photo shows this venue."""

SKIP_WORDS = re.compile(
    r"plaque|tábla|relief|mosaic|chasuble|manuscript|map|plan of|panel|"
    r"grave|tomb|coin|medal|statue detail|inscription|drawing|logo|"
    r"postcard|postkarte|ansichtskarte|lithograph|painting",
    re.IGNORECASE,
)
"""Files that are not a picture of the place as it stands: a plaque, a coin, a
drawing — or a postcard of the square a hotel took its name from a century ago."""

_STOP = frozenset(
    {
        "restaurant",
        "etterem",
        "bar",
        "pub",
        "cafe",
        "kavehaz",
        "kitchen",
        "house",
        "street",
        "utca",
        "bistro",
        "bisztro",
        "vendeglo",
        "sorozo",
    }
)
"""What kind of venue it is, never which one — the lodging half is `LODGING_WORDS`."""

LODGING_WORDS = frozenset(
    {
        "hotel",
        "hostel",
        "hostal",
        "pension",
        "panzio",
        "guesthouse",
        "apartment",
        "apartments",
        "inn",
        "szallo",
        "szalloda",
        "residence",
        "suites",
        "rooms",
        "motel",
    }
)
"""A place to sleep, never which one. Dropped from both sides before the name
and the title are compared, and the one thing that makes a single-word name
believable: `Carlton` is a title only when `Hotel` stands next to it."""

_BED_AND_BREAKFAST = re.compile(r"\bb\s*&\s*b\b", re.IGNORECASE)

NEAR_METRES = 500
"""How far from the venue a file may have been taken and still be of it.

A title names a hotel; it does not say which town's. `Park Hotel, Cortina` is a
hotel of that name in the Dolomites, `Austria Classic Hotel Wien` one in
Vienna, and both answered a search for a hotel elsewhere (TRA-208). Commons
knows where most of its photographs were taken, so the file has to say — and
say the right place — before it is anyone's picture.
"""

EARTH_RADIUS_M = 6_371_000


def haversine_m(lat: float, lon: float, other_lat: float, other_lon: float) -> float:
    """Metres between two points on the globe."""
    phi, other_phi = math.radians(lat), math.radians(other_lat)
    d_phi = other_phi - phi
    d_lambda = math.radians(other_lon - lon)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi) * math.cos(other_phi) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def file_coordinates(data: Mapping[str, Any]) -> tuple[float, float] | None:
    """Where a `prop=coordinates` answer says the file was taken, or None.

    Written for both shapes of the MediaWiki answer: `query.pages` is a list
    under `formatversion=2` (the corpus tool) and a dictionary without it.
    """
    pages = (data.get("query") or {}).get("pages") or []
    for page in pages.values() if isinstance(pages, dict) else pages:
        for point in page.get("coordinates") or []:
            lat, lon = point.get("lat"), point.get("lon")
            if isinstance(lat, int | float) and isinstance(lon, int | float):
                return float(lat), float(lon)
    return None


def taken_near(data: Mapping[str, Any], lat: float, lon: float) -> bool:
    """Whether the file Commons just described was photographed at this venue.

    A file that says nothing about where it was taken is refused: this tier is
    worth having only while it is right, and a name is not a place.
    """
    where = file_coordinates(data)
    return where is not None and haversine_m(lat, lon, *where) <= NEAR_METRES


def fold(text: str) -> str:
    """Lower case, accents dropped, everything else a space.

    `Bud_VI._K+K_Hotel_Opera.JPG` → `bud vi k k hotel opera jpg`, `Baltazár` →
    `baltazar`. The two sides of the comparison are written by different people
    and one of them is a file name, so only letters and digits survive.
    """
    plain = unicodedata.normalize("NFKD", _BED_AND_BREAKFAST.sub(" ", text).casefold())
    letters = "".join(c for c in plain if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^0-9a-z]+", " ", letters).split())


def words_of(text: str) -> list[str]:
    """The folded words of a name or a title, in order."""
    return fold(text).split()


_PHRASE_BREAK = re.compile(r"""[,;:()\[\]{}"«»/·.!?]""")


def phrases_of(text: str) -> list[list[str]]:
    """The title's words grouped as they are written.

    A comma, a bracket or a full stop separates two things named in one title:
    `Karl-Marx-Allee, Hotel Berolina` names a street and then a hotel, and
    `Park Hotel, Cortina` a hotel and then the town it is in. Words on either
    side of such a mark are not written together, whatever the distance.
    """
    return [words for part in _PHRASE_BREAK.split(text) if (words := words_of(part))]


def _city_words(city: str) -> set[str]:
    """The city's own name is never distinctive of a venue in it."""
    return set(words_of(city))


def distinctive_words(name: str, *, city: str = "") -> set[str]:
    """The words of a venue name that could only mean this venue."""
    skip = _STOP | GENERIC_WORDS | LODGING_WORDS | _city_words(city)
    return {w for w in words_of(name) if len(w) >= 5 and w not in skip}


def _without_lodging(words: list[str]) -> list[str]:
    return [w for w in words if w not in LODGING_WORDS]


def _title_text(title: str) -> str:
    """A file title without its `File:` prefix and its extension."""
    stem = title.removeprefix("File:")
    head, dot, tail = stem.rpartition(".")
    return head if dot and len(tail) <= 5 else stem


def _holds_phrase(words: list[str], phrase: list[str]) -> bool:
    """`phrase` written inside `words`, in order and with nothing between."""
    span = len(phrase)
    return any(words[i : i + span] == phrase for i in range(len(words) - span + 1))


def _beside_lodging(words: list[str], word: str) -> bool:
    """`word` written next to `hotel`, `panzió`, `hostal`…: what tells the
    hotel Amadeus from the ship Amadeus in a title that happens to name both."""
    return any(
        w == word
        and any(
            n in LODGING_WORDS for n in words[max(i - 1, 0) : i] + words[i + 1 : i + 2]
        )
        for i, w in enumerate(words)
    )


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
    """The file whose title is this venue's name, or None.

    Commons search answers with whatever shares a word with the query, and the
    answer is junk far more often than not: a ship for `Hotel Amadeus`, a
    flower for `Aster Budapest`, a footballer for `Hostal Casillas`, a memorial
    stone for `Kleist`, a metro station for `Hotel Metro`. A search result is
    the venue only when

    * one phrase of its title carries the venue's whole name, in order, once
      both sides have lost their lodging words (`Ritz-Carlton` in `The
      Ritz-Carlton, Budapest`, `K+K … Opera` in `Bud VI. K+K Hotel Opera`); or
    * the name has two or more distinctive words and the title carries all of
      them (`Sofitel … Chain Bridge` in `Sofitel Budapest Chain Bridge. NE`); or
    * the name has a single distinctive word and the title writes it beside a
      word for a place to sleep, in the same phrase (`Carlton Hotel`) — on its
      own that word is the flower, the footballer and the metro station.

    Words are compared whole and folded, so `Aster` is not `Aster amellus` and
    `night` is not `Over Night`.
    """
    words = distinctive_words(name, city=city)
    if not words:
        return None
    named = _without_lodging(words_of(name))
    for f in _usable(files):
        phrases = phrases_of(_title_text(f["title"]))
        title = {word for phrase in phrases for word in phrase}
        if len(named) >= 2 and any(
            _holds_phrase(_without_lodging(phrase), named) for phrase in phrases
        ):
            return str(f["title"])
        if len(words) >= 2 and words <= title:
            return str(f["title"])
        if len(words) == 1 and any(
            _beside_lodging(phrase, next(iter(words))) for phrase in phrases
        ):
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
    skip = _STOP | LODGING_WORDS | _city_words(city)
    words = {w for w in words_of(name) if len(w) >= 4 and w not in skip}
    for f in _usable(files):
        title = words_of(_title_text(f["title"]))
        if any(w in title for w in words):
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
