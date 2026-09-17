"""MediaWiki API access with an on-disk cache.

Used for the MediaWiki APIs, Overpass and Open-Meteo. Wikimedia API etiquette (https://www.mediawiki.org/wiki/API:Etiquette): a descriptive
User-Agent with a contact, `maxlag`, serial requests (well under the concurrency of 2
the issue allows) and backoff on 429/5xx/maxlag. Every response is cached under
`.cache/` keyed by URL + parameters, so a rebuild with a warm cache never touches the
network and produces byte-identical output.
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

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "TravelAIWorld-city-corpus/0.1 (https://github.com/manupm87/travel-ai-world) httpx"
)
MAX_ATTEMPTS = 10
MAX_BACKOFF_SECONDS = 120.0
MAXLAG_SECONDS = 5
POLITE_DELAY_SECONDS = 0.2
# Hosts with stricter fair-use rules: seconds to wait before each request.
SLOW_HOSTS = {"overpass-api.de": 5.0, "archive-api.open-meteo.com": 1.0}


class CacheMiss(RuntimeError):
    """Offline build asked for a response that is not cached."""


@dataclass(frozen=True)
class Fetched:
    data: dict[str, Any]
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
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
            timeout=httpx.Timeout(60.0),
            transport=transport,
            follow_redirects=True,
        )

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
            return Fetched(data=cached["response"], fetched_at=cached["fetched_at"])
        if self._offline:
            raise CacheMiss(f"not cached: {method} {url} {params}")

        data = fetch()
        fetched_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
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
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._sleep(SLOW_HOSTS.get(host, POLITE_DELAY_SECONDS))
            try:
                if post:
                    response = self._client.post(url, data=params)
                else:
                    response = self._client.get(url, params=params)
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
        if error.get("code") == "maxlag":
            return "maxlag"
        raise RuntimeError(f"{response.url}: API error {error}")
    remark = data.get("remark")  # Overpass reports timeouts in a 200 response
    if isinstance(remark, str) and "error" in remark.lower():
        return f"overpass: {remark}"
    return None
