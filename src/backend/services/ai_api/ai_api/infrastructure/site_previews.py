"""SitePreviewFinder adapter: the image a venue publishes on its own site.

Sights are pictured in the corpus, venues are not: a restaurant, a bar or a
hotel comes from OpenStreetMap with a website and nothing else. What every
chat, every search engine and every social network shows for such a link is
its preview — the `og:image` the site publishes for exactly that purpose —
so that is what the card shows, credited with the site's bare domain
(ADR 0021).

The image is fetched live and kept in memory for a day: never stored in the
corpus, which is licence-clean by construction and this is not. One `GET` of
the venue's own page, at most `max_bytes` of HTML parsed with the standard
library; a lookup that fails for any reason answers None and the caller
falls back.
"""

import ipaddress
import logging
import re
import time
from collections.abc import Callable
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from ai_api.config import AISettings
from ai_api.domain.models import Photo
from ai_api.infrastructure.commons_photos import USER_AGENT

logger = logging.getLogger(__name__)

MAX_REDIRECTS = 3
"""A venue's site may move to www or to https; three hops is plenty. The
client never follows them itself: every hop passes `fetchable` first, so a
redirect cannot lead where the first URL was not allowed to go."""

DENIED_HOSTS = (
    "wikipedia.org",
    "wikivoyage.org",
    "wikimedia.org",
    "wikidata.org",
    "openstreetmap.org",
)
"""Hosts that are never the venue's own site: their preview pictures the
encyclopaedia, not the place. Commons is asked properly, before this."""

PRIVATE_SUFFIXES = (".local", ".internal")

SECOND_LEVEL = frozenset({"co", "com", "org", "net", "gov", "edu", "ac"})
"""Under a two-letter country code these are not the site (`co.uk`, `com.br`)."""

MIN_IMAGE_BYTES = 15_000
"""Below this a "preview" is a favicon, a badge or a tiny logo, not a picture."""

JUNK_PATH = (
    r"platzhalter|placeholder|404|pattern|stripe|shop\.|default|dummy|sample|"
    r"noimage|no-image"
)
"""What a site serves when it has no picture: a placeholder in any language, a
background pattern, the 404 image, a shop's furniture. Never the venue. Kept in
step with the corpus tool's `sources/photos.py` (TRA-208)."""

LOGO_PATH = re.compile(r"logo|icon|favicon|sprite|" + JUNK_PATH, re.IGNORECASE)
"""A preview whose file name says what it is. Sites that publish their logo as
`og:image` are common; a logo on a card is not a photo of the place."""

SECURE_URL = "og:image:secure_url"
META_RANKS = {SECURE_URL: 0, "og:image": 1, "twitter:image": 2, "twitter:image:src": 3}
IMAGE_SRC_RANK = 4
"""`<link rel="image_src">`: the oldest of the conventions, the last choice."""


class _Missing:
    """Tells a cached None (a site with no preview) from an absent entry."""


_MISSING = _Missing()


class SitePreviews:
    name = "site-preview"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        max_bytes: int = 262144,
        cache_seconds: int = 86400,
        cache_size: int = 2000,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._max_bytes = max_bytes
        self._cache_seconds = cache_seconds
        self._cache_size = cache_size
        self._clock = clock
        self._cache: dict[str, tuple[float, Photo | None]] = {}

    @classmethod
    def from_settings(cls, settings: AISettings) -> "SitePreviews":
        timeout = httpx.Timeout(
            connect=settings.SITE_PREVIEW_TIMEOUT,
            read=settings.SITE_PREVIEW_TIMEOUT,
            write=5.0,
            pool=5.0,
        )
        client = httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
            follow_redirects=False,
        )
        return cls(
            client,
            max_bytes=settings.SITE_PREVIEW_MAX_BYTES,
            cache_seconds=settings.SITE_PREVIEW_CACHE_SECONDS,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def preview(self, site_url: str) -> Photo | None:
        """The link preview of the venue's own site, or None.

        Never raises: a card without a photo is worse than one with, but a
        plan without cards is worse than both.
        """
        if not fetchable(site_url):
            return None
        cached = self._cached(site_url)
        if not isinstance(cached, _Missing):
            return cached
        photo = await self._fetch(site_url)
        self._remember(site_url, photo)
        return photo

    async def _fetch(self, site_url: str) -> Photo | None:
        try:
            page = await self._get_following(site_url)
            if page is None:
                return None
            final_url, body, encoding = page
            candidate = best_candidate(body.decode(encoding, errors="replace"))
        except (httpx.HTTPError, UnicodeError, ValueError, LookupError) as exc:
            logger.warning("Site preview lookup failed for %r: %s", site_url, exc)
            return None
        if candidate is None:
            return None
        image = absolute_image(final_url, candidate)
        if image is None or LOGO_PATH.search(urlsplit(image).path):
            return None
        try:
            if not await self._is_a_picture(image):
                return None
        except httpx.HTTPError as exc:
            logger.warning("Site preview image check failed for %r: %s", image, exc)
            return None
        return Photo(url=image, credit=credit_for(final_url))

    async def _is_a_picture(self, image: str) -> bool:
        """One `HEAD` of the candidate: a raster image of a picture's size.

        Parked domains, logos in SVG and 5 KB badges all declare an
        `og:image`; the headers tell them from a photo. A server that does
        not answer `HEAD` (405) is given the benefit of the doubt; a missing
        `Content-Length` is too."""
        url = image
        for _ in range(MAX_REDIRECTS + 1):
            response = await self._client.head(url)
            if response.is_redirect:
                url = urljoin(url, response.headers.get("location", ""))
                if not fetchable(url):
                    return False
                continue
            if response.status_code == 405:
                return True
            if not response.is_success:
                return False
            content_type = response.headers.get("content-type", "").lower()
            if not content_type.startswith("image/") or "svg" in content_type:
                return False
            length = response.headers.get("content-length")
            return not (length and length.isdigit() and int(length) < MIN_IMAGE_BYTES)
        return False

    async def _get_following(self, site_url: str) -> tuple[str, bytes, str] | None:
        """The final HTML page behind at most `MAX_REDIRECTS` hops, each hop
        checked with `fetchable` like the first URL and kept on the same
        site (a venue whose domain now redirects elsewhere is parked, sold
        or gone): (final URL, at most `max_bytes` of body, its charset), or
        None."""
        url = site_url
        for _ in range(MAX_REDIRECTS + 1):
            async with self._client.stream("GET", url) as response:
                if response.is_redirect:
                    location = response.headers.get("location", "")
                    url = urljoin(url, location)
                    if not fetchable(url) or not same_site(site_url, url):
                        logger.info("Site preview refused a redirect to %r", url)
                        return None
                    continue
                if not response.is_success or not is_html(response.headers):
                    return None
                body = await read_limited(response, self._max_bytes)
                return str(response.url), body, response.charset_encoding or "utf-8"
        return None

    def _cached(self, site_url: str) -> Photo | _Missing | None:
        entry = self._cache.get(site_url)
        if entry is None:
            return _MISSING
        stored_at, photo = entry
        if self._clock() - stored_at >= self._cache_seconds:
            del self._cache[site_url]
            return _MISSING
        return photo

    def _remember(self, site_url: str, photo: Photo | None) -> None:
        """Hits and misses alike: a site without a preview must not be asked
        again for every card of every turn."""
        while len(self._cache) >= self._cache_size:
            self._cache.pop(next(iter(self._cache)))
        self._cache[site_url] = (self._clock(), photo)


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


def is_html(headers: httpx.Headers) -> bool:
    return headers.get("content-type", "").strip().lower().startswith("text/html")


async def read_limited(response: httpx.Response, max_bytes: int) -> bytes:
    """At most `max_bytes` of the body; the rest is never pulled over the wire."""
    chunks: list[bytes] = []
    read = 0
    async for chunk in response.aiter_bytes():
        chunks.append(chunk)
        read += len(chunk)
        if read >= max_bytes:
            break
    return b"".join(chunks)[:max_bytes]


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


def absolute_image(final_url: str, candidate: str) -> str | None:
    """The candidate as an absolute https URL, or None when it is neither.

    A site served over https that advertises its preview over http would be
    blocked as mixed content, and every such image answers on https too.
    """
    try:
        parsed = urlsplit(urljoin(final_url, candidate))
    except ValueError:
        return None
    if parsed.scheme == "http":
        parsed = parsed._replace(scheme="https")
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return urlunsplit(parsed)


def registrable_domain(host: str) -> str:
    """`www.hotel.co.uk` → `hotel.co.uk`, `all.accor.com` → `accor.com`.

    Good enough without the public suffix list: two labels, or three when
    the second is a generic word under a country code."""
    labels = host.lower().removeprefix("www.").split(".")
    if len(labels) >= 3 and labels[-2] in SECOND_LEVEL and len(labels[-1]) == 2:
        return ".".join(labels[-3:])
    return ".".join(labels[-2:])


def same_site(site_url: str, other_url: str) -> bool:
    first = urlsplit(site_url).hostname or ""
    second = urlsplit(other_url).hostname or ""
    return registrable_domain(first) == registrable_domain(second)


def credit_for(final_url: str) -> str:
    """The site's bare domain: `restaurantesamm.com`, printed as `Photo: ...`."""
    host = (urlsplit(final_url).hostname or "").lower()
    return host.removeprefix("www.")
