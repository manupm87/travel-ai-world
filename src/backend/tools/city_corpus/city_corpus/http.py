"""HTTP access with an on-disk cache: the APIs, and the venues' own sites.

Used for the MediaWiki APIs, Overpass and Open-Meteo. Wikimedia API etiquette (https://www.mediawiki.org/wiki/API:Etiquette): a descriptive
User-Agent with a contact, `maxlag`, serial requests (well under the concurrency of 2
the issue allows) and backoff on 429/5xx/maxlag. Every response is cached under
`.cache/` keyed by URL + parameters, so a rebuild with a warm cache never touches the
network and produces byte-identical output.

`get_text` and `head` are the other kind of fetch: a venue's own page, which is not
an API — no JSON, no `maxlag`, two attempts instead of ten, a four-second timeout and
the redirects followed by hand so that the caller decides, hop by hop, where the fetch
may go (TRA-208). `hop_allowed` judges the URL it is given before anything is sent,
not only the redirect targets: the first hop is a hop too, and a URL the caller refuses
never reaches the network. They cache under `.cache/sites/<host>/`, apart from the
APIs, and a miss is cached like a hit: a dead hotel site must not be dialled again on
every build.
"""

import hashlib
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "TravelAIWorld-city-corpus/0.1 (https://github.com/manupm87/travel-ai-world) httpx"
)
MAX_ATTEMPTS = 10
MAX_BACKOFF_SECONDS = 120.0
MAXLAG_SECONDS = 5
# Wikidata folds its query service's lag into `maxlag` so that editing bots pause;
# a read-only request has nothing to wait for and is re-sent without the parameter.
QUERY_SERVICE_LAG = "maxlag:wikibase-queryservice"
BUSY_CODES = frozenset(
    {"cirrussearch-too-busy-error", "readonly", "internal_api_error"}
)
"""API errors that mean "not now", not "never": Wikimedia's search backend sheds
load under pressure and answers this to a perfectly good query. Treated like
`maxlag` — wait and ask again — because the alternative is a stage silently
losing a source, and an answer that is not cached and so differs between builds
(TRA-211)."""
POLITE_DELAY_SECONDS = 0.2
# Hosts with stricter fair-use rules: seconds to wait before each request.
SLOW_HOSTS = {
    "overpass-api.de": 5.0,
    # The photo stage asks Commons twice per hotel without a picture; one second
    # between calls keeps a whole city's build inside its fair-use budget.
    "commons.wikimedia.org": 1.0,
    "archive-api.open-meteo.com": 1.0,
    "api.open-meteo.com": 1.0,
    "nominatim.openstreetmap.org": 1.0,
}
# Hosts that answer slower than the client's 60 s: the place queries ask Overpass
# for `[timeout:240]`, and Berlin's took longer than a minute under load (TRA-33).
SLOW_READ_SECONDS = {"overpass-api.de": 250.0}

# Venue sites (`get_text`, `head`): not APIs, so a different budget.
SITE_TIMEOUT_SECONDS = 4.0
SITE_ATTEMPTS = 2
SITE_MAX_REDIRECTS = 3
SITE_MAX_BYTES = 262_144
SITE_CACHE_DIR = "sites"
_SITE_TIMEOUT = httpx.Timeout(SITE_TIMEOUT_SECONDS)
_LOCATION = "_location"  # a redirect target, never written to the cache record


class CacheMiss(RuntimeError):
    """Offline build asked for a response that is not cached."""


@dataclass(frozen=True)
class Fetched:
    data: dict[str, Any]
    fetched_at: str


@dataclass(frozen=True)
class FetchedPage:
    """A venue's page: `status` 0 when nothing was read (transport error, or a
    redirect the caller refused). `text` is cut at `SITE_MAX_BYTES`."""

    final_url: str
    status: int
    content_type: str
    text: str
    fetched_at: str

    @property
    def is_html(self) -> bool:
        return (
            200 <= self.status < 300
            and self.content_type.strip().lower().startswith("text/html")
        )


@dataclass(frozen=True)
class FetchedHead:
    """The headers of a candidate image; `status` 0 when nothing answered."""

    final_url: str
    status: int
    content_type: str
    content_length: int | None
    fetched_at: str


class ApiClient:
    def __init__(
        self,
        cache_dir: Path,
        *,
        offline: bool = False,
        transport: httpx.BaseTransport | None = None,
        sleep: Any = time.sleep,
    ) -> None:
        self._cache_dir = cache_dir
        self._offline = offline
        self._sleep = sleep
        self._last_fetched_at: str | None = None
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
            timeout=httpx.Timeout(60.0),
            transport=transport,
            follow_redirects=True,
        )

    @property
    def last_fetched_at(self) -> str | None:
        """The newest `fetched_at` this client has handed out, cached or fresh.

        A stage that makes one request per document (the photos of TRA-208)
        would otherwise have to carry thousands of timestamps around only for
        the manifest's `built_at`, which is their maximum.
        """
        return self._last_fetched_at

    def _remember(self, fetched_at: str) -> str:
        if self._last_fetched_at is None or fetched_at > self._last_fetched_at:
            self._last_fetched_at = fetched_at
        return fetched_at

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ApiClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def get(self, api_url: str, params: dict[str, str | int]) -> Fetched:
        """MediaWiki API call (JSON, formatversion 2, `maxlag`)."""
        full: dict[str, str | int] = {"format": "json", "formatversion": 2, **params}
        return self._cached(
            api_url,
            full,
            lambda: self._fetch(api_url, {**full, "maxlag": MAXLAG_SECONDS}),
        )

    def get_json(self, url: str, params: dict[str, str | int]) -> Fetched:
        """Plain JSON GET (Open-Meteo)."""
        return self._cached(url, params, lambda: self._fetch(url, params))

    def post_form(self, url: str, form: dict[str, str]) -> Fetched:
        """Form POST returning JSON (Overpass, whose queries are too long for a URL)."""
        return self._cached(
            url, dict(form), lambda: self._fetch(url, dict(form), post=True), "POST"
        )

    def get_text(self, url: str, hop_allowed: Callable[[str], bool]) -> FetchedPage:
        """A venue's page as text (never JSON), at most `SITE_MAX_BYTES` of it.

        `url` itself and every redirect after it pass `hop_allowed` before
        the request is made — redirects are followed here rather than by
        httpx for that reason; a refused hop, a transport error or a
        timeout all answer a miss (`status` 0), and the miss is cached.
        """
        record, fetched_at = self._cached_site(
            url, "TEXT", lambda: self._fetch_page(url, hop_allowed)
        )
        return FetchedPage(
            final_url=str(record.get("final_url") or url),
            status=int(record.get("status") or 0),
            content_type=str(record.get("content_type") or ""),
            text=str(record.get("text") or ""),
            fetched_at=fetched_at,
        )

    def head(
        self, url: str, hop_allowed: Callable[[str], bool] | None = None
    ) -> FetchedHead:
        """The headers of a URL: what a candidate image says it is, without
        downloading it. Redirects are followed by hand, and `url` itself and
        every hop after it are offered to `hop_allowed` when one is given —
        a refused URL is a miss no request was made for."""
        record, fetched_at = self._cached_site(
            url, "HEAD", lambda: self._fetch_head(url, hop_allowed)
        )
        length = record.get("content_length")
        return FetchedHead(
            final_url=str(record.get("final_url") or url),
            status=int(record.get("status") or 0),
            content_type=str(record.get("content_type") or ""),
            content_length=int(length) if isinstance(length, int) else None,
            fetched_at=fetched_at,
        )

    def _fetch_page(
        self, url: str, hop_allowed: Callable[[str], bool]
    ) -> dict[str, Any]:
        if not hop_allowed(url):
            logger.info("%s: refused before the first request", url)
            return _site_miss(url)
        current = url
        for _ in range(SITE_MAX_REDIRECTS + 1):
            record = self._read_page(current)
            if record is None:
                return _site_miss(current)
            location = record.pop(_LOCATION, None)
            if location is None:
                return record
            if not hop_allowed(location):
                logger.info("%s: refused a redirect to %s", url, location)
                return _site_miss(current)
            current = location
        return _site_miss(current)

    def _fetch_head(
        self, url: str, hop_allowed: Callable[[str], bool] | None
    ) -> dict[str, Any]:
        if hop_allowed is not None and not hop_allowed(url):
            logger.info("%s: refused before the first request", url)
            return _site_miss(url)
        current = url
        for _ in range(SITE_MAX_REDIRECTS + 1):
            record = self._read_head(current)
            if record is None:
                return _site_miss(current)
            location = record.pop(_LOCATION, None)
            if location is None:
                return record
            if hop_allowed is not None and not hop_allowed(location):
                logger.info("%s: refused a redirect to %s", url, location)
                return _site_miss(current)
            current = location
        return _site_miss(current)

    def _read_page(self, url: str) -> dict[str, Any] | None:
        """One page, at most `SITE_ATTEMPTS` tries; None when none answered."""
        for attempt in range(1, SITE_ATTEMPTS + 1):
            self._pause(url)
            try:
                with self._client.stream(
                    "GET", url, timeout=_SITE_TIMEOUT, follow_redirects=False
                ) as response:
                    if response.is_redirect:
                        return {_LOCATION: _location_of(url, response)}
                    body = _read_limited(response)
                    return {
                        "final_url": str(response.url),
                        "status": response.status_code,
                        "content_type": response.headers.get("content-type", ""),
                        "text": _decoded(body, response.charset_encoding),
                    }
            except httpx.HTTPError as exc:
                logger.info("GET %s: %s (attempt %d)", url, exc, attempt)
        return None

    def _read_head(self, url: str) -> dict[str, Any] | None:
        for attempt in range(1, SITE_ATTEMPTS + 1):
            self._pause(url)
            try:
                response = self._client.head(
                    url, timeout=_SITE_TIMEOUT, follow_redirects=False
                )
            except httpx.HTTPError as exc:
                logger.info("HEAD %s: %s (attempt %d)", url, exc, attempt)
                continue
            if response.is_redirect:
                return {_LOCATION: _location_of(url, response)}
            length = response.headers.get("content-length", "")
            return {
                "final_url": str(response.url),
                "status": response.status_code,
                "content_type": response.headers.get("content-type", ""),
                "content_length": int(length) if length.isdigit() else None,
            }
        return None

    def _pause(self, url: str) -> None:
        self._sleep(SLOW_HOSTS.get(httpx.URL(url).host, POLITE_DELAY_SECONDS))

    def _cached_site(
        self, url: str, kind: str, fetch: Callable[[], dict[str, Any]]
    ) -> tuple[dict[str, Any], str]:
        """Like `_cached`, under `.cache/sites/<host>/`: the APIs and the open
        web share no namespace, and a site's record has no parameters."""
        path = self._site_cache_path(url, kind)
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            return cached["response"], self._remember(cached["fetched_at"])
        if self._offline:
            raise CacheMiss(f"not cached: {kind} {url}")
        data = fetch()
        fetched_at = self._remember(datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "url": url,
            "method": kind,
            "fetched_at": fetched_at,
            "response": data,
        }
        path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return data, fetched_at

    def _site_cache_path(self, url: str, kind: str) -> Path:
        key = json.dumps([url, kind], ensure_ascii=False)
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        host = httpx.URL(url).host or "unknown"
        return self._cache_dir / SITE_CACHE_DIR / host / f"{digest}.json"

    def _cached(
        self,
        url: str,
        params: dict[str, str | int],
        fetch: Callable[[], dict[str, Any]],
        method: str = "GET",
    ) -> Fetched:
        path = self._cache_path(url, params, method)
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            return Fetched(
                data=cached["response"],
                fetched_at=self._remember(cached["fetched_at"]),
            )
        if self._offline:
            raise CacheMiss(f"not cached: {method} {url} {params}")

        data = fetch()
        fetched_at = self._remember(datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"))
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "url": url,
            "method": method,
            "params": params,
            "fetched_at": fetched_at,
            "response": data,
        }
        path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return Fetched(data=data, fetched_at=fetched_at)

    def _fetch(
        self, url: str, params: dict[str, str | int], *, post: bool = False
    ) -> dict[str, Any]:
        host = httpx.URL(url).host
        delay = SLOW_HOSTS.get(host, 2.0)
        read = SLOW_READ_SECONDS.get(host)
        timeout = httpx.Timeout(60.0, read=read) if read else httpx.USE_CLIENT_DEFAULT
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._sleep(SLOW_HOSTS.get(host, POLITE_DELAY_SECONDS))
            try:
                if post:
                    response = self._client.post(url, data=params, timeout=timeout)
                else:
                    response = self._client.get(url, params=params, timeout=timeout)
            except httpx.TransportError as exc:
                logger.warning("%s: %s (attempt %d)", url, exc, attempt)
            else:
                retry_after = response.headers.get("Retry-After")
                if response.status_code == 429 or response.status_code >= 500:
                    logger.warning("%s: HTTP %d", url, response.status_code)
                else:
                    response.raise_for_status()
                    problem = _retryable_problem(response)
                    if problem is None:
                        return response.json()
                    if problem == QUERY_SERVICE_LAG and "maxlag" in params:
                        logger.info(
                            "%s: query service lags; reading without maxlag", url
                        )
                        params = {k: v for k, v in params.items() if k != "maxlag"}
                        continue
                    logger.warning("%s: %s (attempt %d)", url, problem, attempt)
                if retry_after and retry_after.isdigit():
                    delay = max(delay, float(retry_after))
            if attempt < MAX_ATTEMPTS:
                self._sleep(delay)
                delay = min(delay * 2, MAX_BACKOFF_SECONDS)
        raise RuntimeError(f"{url}: giving up after {MAX_ATTEMPTS} attempts")

    def _cache_path(
        self, url: str, params: dict[str, str | int], method: str = "GET"
    ) -> Path:
        parts: list[Any] = [url, sorted(params.items())]
        if method != "GET":  # GET keys predate the method and must not change
            parts.append(method)
        key = json.dumps(parts, ensure_ascii=False)
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        return self._cache_dir / httpx.URL(url).host / f"{digest}.json"


def _location_of(url: str, response: httpx.Response) -> str:
    return urljoin(url, response.headers.get("location", ""))


def _decoded(body: bytes, encoding: str | None) -> str:
    try:
        return body.decode(encoding or "utf-8", errors="replace")
    except LookupError:  # a charset no codec knows
        return body.decode("utf-8", errors="replace")


def _site_miss(url: str) -> dict[str, Any]:
    """Nothing was read. Cached all the same: a dead domain stays dead."""
    return {"final_url": url, "status": 0, "content_type": "", "text": ""}


def _read_limited(response: httpx.Response) -> bytes:
    """At most `SITE_MAX_BYTES` of the body; the rest never crosses the wire."""
    chunks: list[bytes] = []
    read = 0
    for chunk in response.iter_bytes():
        chunks.append(chunk)
        read += len(chunk)
        if read >= SITE_MAX_BYTES:
            break
    return b"".join(chunks)[:SITE_MAX_BYTES]


def _retryable_problem(response: httpx.Response) -> str | None:
    """None for a usable JSON body; a reason to retry otherwise. Other API errors raise."""
    try:
        data = response.json()
    except ValueError:
        return "body is not JSON"
    if not isinstance(data, dict):
        return None
    error = data.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        if code == "maxlag":
            if error.get("type") == "wikibase-queryservice":
                return QUERY_SERVICE_LAG
            return "maxlag"
        if code in BUSY_CODES:
            return str(code)
        raise RuntimeError(f"{response.url}: API error {error}")
    remark = data.get("remark")  # Overpass reports timeouts in a 200 response
    if isinstance(remark, str) and "error" in remark.lower():
        return f"overpass: {remark}"
    return None
