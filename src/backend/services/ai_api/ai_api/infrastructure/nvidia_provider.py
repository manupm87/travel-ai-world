"""LLMProvider adapter for NVIDIA's OpenAI-compatible chat completions API.

One instance per process: it owns an `httpx.AsyncClient` (connection pool,
keep-alive) that the app lifespan closes on shutdown.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import asdict

import httpx
from travel_common.exceptions import ProviderUnavailable

from ai_api.config import AISettings
from ai_api.domain.models import GenerationParams, Message
from ai_api.infrastructure.retry import RetryPolicy
from ai_api.infrastructure.sse import SSEParser

logger = logging.getLogger(__name__)

# What the browser sees. Upstream status codes and bodies stay in the logs.
UPSTREAM_ERROR_MESSAGE = "AI provider error"


class NvidiaProvider:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        client: httpx.AsyncClient,
        params: GenerationParams = GenerationParams(),
        retry: RetryPolicy = RetryPolicy(),
    ) -> None:
        self._api_key = api_key
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._client = client
        self._params = params
        self._retry = retry

    @classmethod
    def from_settings(cls, settings: AISettings) -> "NvidiaProvider":
        """Build the process-wide instance from `AISettings`."""
        timeout = httpx.Timeout(
            connect=settings.NVIDIA_CONNECT_TIMEOUT,
            read=settings.NVIDIA_READ_TIMEOUT,
            write=10.0,
            pool=10.0,
        )
        return cls(
            api_key=settings.NVIDIA_API_KEY,
            base_url=settings.NVIDIA_BASE_URL,
            model=settings.NVIDIA_CHAT_MODEL,
            client=httpx.AsyncClient(timeout=timeout),
            params=GenerationParams(
                max_tokens=settings.CHAT_MAX_TOKENS,
                temperature=settings.CHAT_TEMPERATURE,
                top_p=settings.CHAT_TOP_P,
            ),
            retry=RetryPolicy(max_retries=settings.NVIDIA_MAX_RETRIES),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def stream(self, messages: Sequence[Message]) -> AsyncIterator[str]:
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")

        yielded = False
        for delay in self._retry.delays():
            try:
                async for delta in self._stream_once(messages):
                    yielded = True
                    yield delta
                return
            except httpx.HTTPError as exc:
                # Retrying after partial output would duplicate text.
                if yielded or delay is None:
                    logger.error("NVIDIA API failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("NVIDIA API error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)

    async def _stream_once(self, messages: Sequence[Message]) -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": [asdict(m) for m in messages],
            **asdict(self._params),
            "stream": True,
        }
        parser = SSEParser()
        async with self._client.stream(
            "POST", self._url, headers=headers, json=payload
        ) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                raise httpx.HTTPStatusError(
                    f"NVIDIA API returned {resp.status_code}: {body[:500]}",
                    request=resp.request,
                    response=resp,
                )
            async for chunk in resp.aiter_text():
                for data in parser.feed(chunk):
                    delta = _extract_delta(data)
                    if delta:
                        yield delta


def _extract_delta(data: str) -> str | None:
    if data == "[DONE]":
        return None
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        logger.debug("Skipping malformed SSE data: %s", data)
        return None
    choices = parsed.get("choices") or []
    if not choices:
        return None
    delta = choices[0].get("delta") or {}
    # Some models emit "content", others "text".
    return delta.get("content") or delta.get("text")
