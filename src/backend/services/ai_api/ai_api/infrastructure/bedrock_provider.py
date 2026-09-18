"""LLMProvider adapter for Amazon Bedrock's Converse API.

No API key: boto3 signs requests with whatever credentials the process has
(the function's IAM role on Lambda, the SSO session on a laptop). Model IDs
are cross-region inference profiles (`eu.` prefix), so Anthropic and Nova
requests are served inside the EU.

boto3 is synchronous. Every call runs in a worker thread through
`asyncio.to_thread`, one hop per streamed event, so the event loop keeps
serving other requests while an answer streams.
"""

import asyncio
import logging
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from typing import Any, Protocol, cast

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from travel_common.exceptions import ProviderUnavailable

from ai_api.config import AISettings
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.bedrock import client_config, is_retryable
from ai_api.infrastructure.retry import RetryPolicy

logger = logging.getLogger(__name__)

# What the browser sees. Bedrock's error codes and messages stay in the logs.
UPSTREAM_ERROR_MESSAGE = "AI provider error"

_END = object()


class BedrockRuntimeClient(Protocol):
    """The two operations this adapter uses.

    boto3's `bedrock-runtime` client satisfies it; tests pass a fake.
    """

    def converse_stream(self, **kwargs: Any) -> Any: ...

    def converse(self, **kwargs: Any) -> Any: ...


class BedrockProvider:
    name = "bedrock"

    def __init__(
        self,
        *,
        client: BedrockRuntimeClient,
        model: str,
        params: GenerationParams = GenerationParams(),
        retry: RetryPolicy = RetryPolicy(),
    ) -> None:
        self._client = client
        self._model = model
        self._params = params
        self._retry = retry

    @classmethod
    def from_settings(cls, settings: AISettings) -> "BedrockProvider":
        """Build the process-wide instance from `AISettings`.

        Credentials and the region come from the environment (boto3's usual
        chain); nothing is read from a file of ours.
        """
        config = client_config(
            region=settings.BEDROCK_REGION,
            connect_timeout=settings.BEDROCK_CONNECT_TIMEOUT,
            read_timeout=settings.BEDROCK_READ_TIMEOUT,
        )
        # boto3 builds clients at runtime; the Protocol is the static contract.
        client = cast(
            BedrockRuntimeClient, boto3.client("bedrock-runtime", config=config)
        )
        return cls(
            client=client,
            model=settings.BEDROCK_CHAT_MODEL,
            params=GenerationParams(
                max_tokens=settings.CHAT_MAX_TOKENS,
                temperature=settings.CHAT_TEMPERATURE,
                top_p=settings.CHAT_TOP_P,
            ),
            retry=RetryPolicy(max_retries=settings.BEDROCK_MAX_RETRIES),
        )

    @property
    def is_configured(self) -> bool:
        return bool(self._model)

    async def aclose(self) -> None:
        """boto3 clients hold nothing that needs closing; here for symmetry."""
        return None

    async def stream(
        self, messages: Sequence[Message], *, usage: Usage | None = None
    ) -> AsyncIterator[str]:
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")

        request = self._request(messages)
        yielded = False
        for delay in self._retry.delays():
            try:
                async for delta in self._stream_once(request, usage):
                    yielded = True
                    yield delta
                return
            except (ClientError, BotoCoreError) as exc:
                # Retrying after partial output would duplicate text.
                if yielded or delay is None or not is_retryable(exc):
                    logger.error("Bedrock request failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("Bedrock error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)

    async def complete(
        self,
        messages: Sequence[Message],
        *,
        usage: Usage | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """One non-streamed answer: structured output, titles, short jobs.

        `model` overrides the chat model (a cheaper one for trivial tasks).
        """
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")
        request = self._request(messages, model=model, max_tokens=max_tokens)
        for delay in self._retry.delays():
            try:
                response = await asyncio.to_thread(self._client.converse, **request)
            except (ClientError, BotoCoreError) as exc:
                if delay is None or not is_retryable(exc):
                    logger.error("Bedrock request failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("Bedrock error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)
            else:
                _record_usage(response, request["modelId"], usage)
                return _output_text(response)
        raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE)  # pragma: no cover

    def _request(
        self,
        messages: Sequence[Message],
        *,
        model: str | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        system, turns = _converse_messages(messages)
        request: dict[str, Any] = {
            "modelId": model or self._model,
            "messages": turns,
            # Claude 4.5+ rejects a request that sets both temperature and
            # top_p, so only the temperature travels (CHAT_TOP_P is NVIDIA's).
            "inferenceConfig": {
                "maxTokens": max_tokens or self._params.max_tokens,
                "temperature": self._params.temperature,
            },
        }
        if system:
            request["system"] = system
        return request

    async def _stream_once(
        self, request: dict[str, Any], usage: Usage | None
    ) -> AsyncIterator[str]:
        response = await asyncio.to_thread(self._client.converse_stream, **request)
        events: Iterator[Any] = iter(response["stream"])
        while True:
            event: Any = await asyncio.to_thread(next, events, _END)
            if event is _END:
                return
            delta = _extract_delta(event, self._model, usage)
            if delta:
                yield delta


def _converse_messages(
    messages: Sequence[Message],
) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    """Split our flat message list into Converse's `system` and `messages`.

    Converse wants the system prompts apart, a conversation that starts with
    a user turn, alternating roles and no empty text blocks. Consecutive
    turns with the same role are merged into one message with several
    blocks; a leading assistant turn (a client replaying an odd history) is
    dropped, as are blank turns.
    """
    system = [
        {"text": m.content}
        for m in messages
        if m.role == "system" and m.content.strip()
    ]
    turns: list[dict[str, Any]] = []
    for message in messages:
        if message.role == "system" or not message.content.strip():
            continue
        if not turns and message.role != "user":
            continue
        if turns and turns[-1]["role"] == message.role:
            turns[-1]["content"].append({"text": message.content})
        else:
            turns.append({"role": message.role, "content": [{"text": message.content}]})
    return system, turns


def _extract_delta(
    event: Mapping[str, Any], model: str, usage: Usage | None = None
) -> str | None:
    """Text of a `contentBlockDelta`; tool-use deltas and control events yield None.

    The final `metadata` event carries the token usage: logged so the cost of
    a deployment can be reconciled with Cost Explorer, and handed to the
    caller through `usage` so a recorded conversation keeps it.
    """
    text = event.get("contentBlockDelta", {}).get("delta", {}).get("text")
    if text:
        return text
    reported = event.get("metadata", {}).get("usage")
    if reported:
        logger.info(
            "Bedrock usage model=%s input_tokens=%s output_tokens=%s",
            model,
            reported.get("inputTokens"),
            reported.get("outputTokens"),
        )
        if usage is not None:
            usage.model = model
            usage.input_tokens = reported.get("inputTokens")
            usage.output_tokens = reported.get("outputTokens")
    return None


def _record_usage(response: Mapping[str, Any], model: str, usage: Usage | None) -> None:
    reported = response.get("usage") or {}
    if reported:
        logger.info(
            "Bedrock usage model=%s input_tokens=%s output_tokens=%s",
            model,
            reported.get("inputTokens"),
            reported.get("outputTokens"),
        )
    if usage is not None:
        usage.model = model
        usage.input_tokens = reported.get("inputTokens")
        usage.output_tokens = reported.get("outputTokens")


def _output_text(response: Mapping[str, Any]) -> str:
    blocks = response.get("output", {}).get("message", {}).get("content", [])
    return "".join(block.get("text", "") for block in blocks).strip()
