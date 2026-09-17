"""MediaWiki API access with an on-disk cache.

Wikimedia API etiquette (https://www.mediawiki.org/wiki/API:Etiquette): a descriptive
User-Agent with a contact, `maxlag`, serial requests (well under the concurrency of 2
the issue allows) and backoff on 429/5xx/maxlag. Every response is cached under
`.cache/` keyed by URL + parameters, so a rebuild with a warm cache never touches the
network and produces byte-identical output.
"""

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "TravelAIWorld-city-corpus/0.1 (https://github.com/manupm87/travel-ai-world) httpx"
)
MAX_ATTEMPTS = 6
MAXLAG_SECONDS = 5
POLITE_DELAY_SECONDS = 0.2


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
        full = {"format": "json", "formatversion": 2, **params}
        path = self._cache_path(api_url, full)
        if path.exists():
            cached = json.loads(path.read_text(encoding="utf-8"))
            return Fetched(data=cached["response"], fetched_at=cached["fetched_at"])
        if self._offline:
            raise CacheMiss(f"not cached: {api_url} {params}")

        data = self._fetch(api_url, {**full, "maxlag": MAXLAG_SECONDS})
        fetched_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "url": api_url,
            "params": full,
            "fetched_at": fetched_at,
            "response": data,
        }
        path.write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
        return Fetched(data=data, fetched_at=fetched_at)

    def _fetch(self, api_url: str, params: dict[str, str | int]) -> dict[str, Any]:
        delay = 2.0
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._sleep(POLITE_DELAY_SECONDS)
            try:
                response = self._client.get(api_url, params=params)
            except httpx.TransportError as exc:
                logger.warning("%s: %s (attempt %d)", api_url, exc, attempt)
            else:
                retry_after = response.headers.get("Retry-After")
                if response.status_code == 429 or response.status_code >= 500:
                    logger.warning("%s: HTTP %d", api_url, response.status_code)
                else:
                    response.raise_for_status()
                    data = response.json()
                    error = data.get("error")
                    if error is None:
                        return data
                    if error.get("code") != "maxlag":
                        raise RuntimeError(f"{api_url}: API error {error}")
                    logger.warning("%s: maxlag", api_url)
                if retry_after and retry_after.isdigit():
                    delay = max(delay, float(retry_after))
            if attempt < MAX_ATTEMPTS:
                self._sleep(delay)
                delay *= 2
        raise RuntimeError(f"{api_url}: giving up after {MAX_ATTEMPTS} attempts")

    def _cache_path(self, api_url: str, params: dict[str, str | int]) -> Path:
        key = json.dumps([api_url, sorted(params.items())], ensure_ascii=False)
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        host = httpx.URL(api_url).host
        return self._cache_dir / host / f"{digest}.json"
