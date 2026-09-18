"""LLMProvider adapter for NVIDIA's OpenAI-compatible chat completions API.

One instance per process: it owns an `httpx.AsyncClient` (connection pool,
keep-alive) that the app lifespan closes on shutdown.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import asdict
from typing import Any

import httpx
from travel_common.exceptions import ProviderUnavailable

from ai_api.config import AISettings
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.retry import RetryPolicy
from ai_api.infrastructure.sse import SSEParser

logger = logging.getLogger(__name__)

# What the browser sees. Upstream status codes and bodies stay in the logs.
UPSTREAM_ERROR_MESSAGE = "AI provider error"


class NvidiaProvider:
    name = "nvidia"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        client: httpx.AsyncClient,
        params: GenerationParams = GenerationParams(),
        retry: RetryPolicy = RetryPolicy(),
        thinking: bool = False,
    ) -> None:
        self._api_key = api_key
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._model = model
        self._client = client
        self._params = params
        self._retry = retry
        self._thinking = thinking

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
            thinking=settings.NVIDIA_THINKING,
        )

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def stream(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> AsyncIterator[str]:
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")

        if usage is not None:
            usage.model = self._model
        yielded = False
        for delay in self._retry.delays():
            try:
                async for delta in self._stream_once(messages, usage):
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

    async def complete(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> str:
        """One whole answer (no stream), for structured output."""
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")
        if usage is not None:
            usage.model = self._model
        payload = self._payload(messages) | {"stream": False}
        for delay in self._retry.delays():
            try:
                response = await self._client.post(
                    self._url, headers=self._headers(), json=payload
                )
                if response.status_code != 200:
                    raise httpx.HTTPStatusError(
                        f"NVIDIA API returned {response.status_code}: "
                        f"{response.text[:500]}",
                        request=response.request,
                        response=response,
                    )
            except httpx.HTTPError as exc:
                if delay is None:
                    logger.error("NVIDIA API failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("NVIDIA API error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)
            else:
                return _output_text(response.json(), usage)
        raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE)  # pragma: no cover

    def _headers(self, *, stream: bool = False) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "text/event-stream" if stream else "application/json",
            "Content-Type": "application/json",
        }

    def _payload(self, messages: Sequence[Message]) -> dict[str, Any]:
        return {
            "model": self._model,
            "messages": [asdict(m) for m in messages],
            **asdict(self._params),
            # Honoured by reasoning models (Nemotron, Qwen, ...), ignored by the
            # rest. Reasoning, when on, arrives as `reasoning_content` deltas,
            # which `_extract_delta` drops: only the answer is streamed.
            "chat_template_kwargs": {"enable_thinking": self._thinking},
        }

    async def _stream_once(
        self, messages: Sequence[Message], usage: Usage | None
    ) -> AsyncIterator[str]:
        headers = self._headers(stream=True)
        payload = self._payload(messages) | {
            "stream": True,
            # A last chunk with the token counts (OpenAI-compatible APIs).
            "stream_options": {"include_usage": True},
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
                    delta = _extract_delta(data, usage)
                    if delta:
                        yield delta


def _output_text(parsed: dict[str, Any], usage: Usage | None = None) -> str:
    """The answer of a non-streamed completion, with its token counts."""
    reported = parsed.get("usage")
    if usage is not None and reported:
        usage.input_tokens = reported.get("prompt_tokens")
        usage.output_tokens = reported.get("completion_tokens")
    choices = parsed.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    return str(message.get("content") or "")


def _extract_delta(data: str, usage: Usage | None = None) -> str | None:
    if data == "[DONE]":
        return None
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        logger.debug("Skipping malformed SSE data: %s", data)
        return None
    reported = parsed.get("usage")
    if usage is not None and reported:
        usage.input_tokens = reported.get("prompt_tokens")
        usage.output_tokens = reported.get("completion_tokens")
    choices = parsed.get("choices") or []
    if not choices:
        return None
    delta = choices[0].get("delta") or {}
    # Some models emit "content", others "text".
    return delta.get("content") or delta.get("text")
