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
from ai_api.domain.agent import (
    AgentEvent,
    AgentMessage,
    StepEnd,
    StopReason,
    TextDelta,
    ToolCallReady,
    ToolSpec,
    parse_tool_call,
)
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.retry import RetryPolicy
from ai_api.infrastructure.sse import SSEParser

logger = logging.getLogger(__name__)

# What the browser sees. Upstream status codes and bodies stay in the logs.
UPSTREAM_ERROR_MESSAGE = "AI provider error"
STRUCTURED_OUTPUT_MODEL = "z-ai/glm-5.3-flash"
# Models verified to stream `tool_calls` (ADR 0032; tests/manual/converse_probe.py).
# nvidia/nemotron-3-super-120b-a12b streamed a correct `get_weather` call on
# 2026-10-19 (TRA-290); z-ai/glm-5.3-flash read-timed out on every probe that day and
# minimaxai/minimax-m3 is retired upstream (HTTP 410 since 2026-09-09).
TOOL_USE_MODELS: frozenset[str] = frozenset({"nvidia/nemotron-3-super-120b-a12b"})
_FINISH_REASONS: dict[str, StopReason] = {
    "stop": "end_turn",
    "tool_calls": "tool_use",
    "length": "max_tokens",
}


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

    @property
    def supports_structured_outputs(self) -> bool:
        return self._model == STRUCTURED_OUTPUT_MODEL

    @property
    def supports_tools(self) -> bool:
        return self._model in TOOL_USE_MODELS

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
        self,
        messages: Sequence[Message],
        *,
        response_schema: dict[str, object] | None = None,
        response_schema_name: str | None = None,
        usage: Usage | None = None,
    ) -> str:
        """One whole answer (no stream), for structured output."""
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")
        if usage is not None:
            usage.model = self._model
        payload = self._payload(messages) | {"stream": False}
        if response_schema is not None and self.supports_structured_outputs:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema_name or "structured_response",
                    "strict": True,
                    "schema": response_schema,
                },
            }
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

    async def converse(
        self,
        system: Sequence[str],
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolSpec],
        *,
        usage: Usage | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """One tool-using step: OpenAI `tools`, streamed `tool_calls`."""
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")
        if usage is not None:
            usage.model = self._model
        payload = self._base_payload(_agent_messages(system, messages)) | {
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            payload["tools"] = [_tool(tool) for tool in tools]
            payload["tool_choice"] = "auto"
        yielded = False
        for delay in self._retry.delays():
            try:
                async for item in self._converse_once(payload, usage):
                    yielded = True
                    yield item
                return
            except httpx.HTTPError as exc:
                # Retrying after partial output would duplicate text or calls.
                if yielded or delay is None:
                    logger.error("NVIDIA API failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("NVIDIA API error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)

    async def _converse_once(
        self, payload: dict[str, Any], usage: Usage | None
    ) -> AsyncIterator[AgentEvent]:
        parser = SSEParser()
        # index -> [id, name, argument fragments]
        calls: dict[int, tuple[list[str], list[str], list[str]]] = {}
        finish: str | None = None
        async with self._client.stream(
            "POST", self._url, headers=self._headers(stream=True), json=payload
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
                    parsed = _chunk(data, usage)
                    if parsed is None:
                        continue
                    choice = (parsed.get("choices") or [{}])[0]
                    finish = choice.get("finish_reason") or finish
                    delta = choice.get("delta") or {}
                    text = delta.get("content") or delta.get("text")
                    if text:
                        yield TextDelta(text)
                    for fragment in delta.get("tool_calls") or []:
                        _accumulate(calls, fragment)
        for index in sorted(calls):
            call_id, name, arguments = calls[index]
            yield ToolCallReady(
                parse_tool_call(
                    "".join(call_id) or f"call_{index}",
                    "".join(name),
                    "".join(arguments),
                )
            )
        stop: StopReason = _FINISH_REASONS.get(finish or "", "other")
        # Some models finish a step that called tools with "stop".
        if calls and stop == "end_turn":
            stop = "tool_use"
        yield StepEnd(stop)

    def _headers(self, *, stream: bool = False) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Accept": "text/event-stream" if stream else "application/json",
            "Content-Type": "application/json",
        }

    def _payload(self, messages: Sequence[Message]) -> dict[str, Any]:
        return self._base_payload([asdict(m) for m in messages])

    def _base_payload(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            **asdict(self._params),
            # Honoured by reasoning models (Nemotron, Qwen, ...), ignored by the
            # rest. Reasoning, when on, arrives as `reasoning_content` deltas,
            # which `_extract_delta` drops: only the answer is streamed.
            "chat_template_kwargs": {"enable_thinking": self._thinking},
        }
        if self.supports_structured_outputs:
            payload["reasoning_effort"] = "low"
            payload["chat_template_kwargs"]["clear_thinking"] = True
        return payload

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


def _tool(tool: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.input_schema,
        },
    }


def _agent_messages(
    system: Sequence[str], messages: Sequence[AgentMessage]
) -> list[dict[str, Any]]:
    """Our agent turns as OpenAI chat messages.

    The system prompts go in one `system` message; an assistant turn carries
    its calls as `tool_calls` (arguments as JSON text); each tool result is
    its own `tool` message, ahead of the user's text when both travel.
    """
    wire: list[dict[str, Any]] = []
    prompt = "\n\n".join(text for text in system if text.strip())
    if prompt:
        wire.append({"role": "system", "content": prompt})
    for message in messages:
        if message.role == "assistant":
            if not message.text.strip() and not message.tool_calls:
                continue
            turn: dict[str, Any] = {
                "role": "assistant",
                "content": message.text or None,
            }
            if message.tool_calls:
                turn["tool_calls"] = [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": json.dumps(call.arguments),
                        },
                    }
                    for call in message.tool_calls
                ]
            wire.append(turn)
            continue
        wire.extend(
            {
                "role": "tool",
                "tool_call_id": result.call_id,
                "content": result.content,
            }
            for result in message.tool_results
        )
        if message.text.strip():
            wire.append({"role": "user", "content": message.text})
    return wire


def _accumulate(
    calls: dict[int, tuple[list[str], list[str], list[str]]],
    fragment: dict[str, Any],
) -> None:
    """One streamed `tool_calls` fragment: id and name arrive once, the
    arguments in pieces, all keyed by `index`."""
    index = fragment.get("index", 0)
    call_id, name, arguments = calls.setdefault(index, ([], [], []))
    if fragment.get("id"):
        call_id[:] = [str(fragment["id"])]
    function = fragment.get("function") or {}
    if function.get("name"):
        name.append(str(function["name"]))
    if function.get("arguments"):
        arguments.append(str(function["arguments"]))


def _chunk(data: str, usage: Usage | None = None) -> dict[str, Any] | None:
    """One SSE data line parsed, its usage (if any) handed to `usage`."""
    if data == "[DONE]":
        return None
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError:
        logger.debug("Skipping malformed SSE data: %s", data)
        return None
    if not isinstance(parsed, dict):
        return None
    reported = parsed.get("usage")
    if usage is not None and reported:
        usage.input_tokens = reported.get("prompt_tokens")
        usage.output_tokens = reported.get("completion_tokens")
    return parsed


def _extract_delta(data: str, usage: Usage | None = None) -> str | None:
    parsed = _chunk(data, usage)
    if parsed is None:
        return None
    choices = parsed.get("choices") or []
    if not choices:
        return None
    delta = choices[0].get("delta") or {}
    # Some models emit "content", others "text".
    return delta.get("content") or delta.get("text")
