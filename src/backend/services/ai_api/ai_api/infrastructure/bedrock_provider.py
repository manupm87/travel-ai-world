"""LLMProvider adapter for Amazon Bedrock's Converse API.

Model IDs are cross-region inference profiles (`eu.` prefix), so requests are served
inside the EU. boto3 is synchronous: every call, and every streamed event, takes one
hop to a worker thread so the event loop keeps serving other requests.
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from typing import Any, Protocol, cast

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from travel_common.exceptions import ProviderUnavailable

from ai_api.config import AISettings
from ai_api.domain.agent import (
    AgentEvent,
    AgentMessage,
    StepEnd,
    StopReason,
    TextDelta,
    ToolCall,
    ToolCallReady,
    ToolSpec,
    parse_tool_call,
)
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.bedrock import client_config, is_retryable
from ai_api.infrastructure.retry import RetryPolicy

logger = logging.getLogger(__name__)

# What the browser sees. Bedrock's error codes and messages stay in the logs.
UPSTREAM_ERROR_MESSAGE = "AI provider error"
STRUCTURED_OUTPUT_MODELS = {"eu.anthropic.claude-haiku-4-5-20251001-v1:0"}
# Profiles verified to call tools through Converse `toolConfig` (ADR 0032).
TOOL_USE_MODELS = {"eu.anthropic.claude-haiku-4-5-20251001-v1:0"}
_STOP_REASONS: dict[str, StopReason] = {
    "end_turn": "end_turn",
    "tool_use": "tool_use",
    "max_tokens": "max_tokens",
}

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
        """Build the process-wide instance; credentials come from boto3's chain."""
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

    @property
    def supports_structured_outputs(self) -> bool:
        return self._model in STRUCTURED_OUTPUT_MODELS

    @property
    def supports_tools(self) -> bool:
        return self._model in TOOL_USE_MODELS

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
        response_schema: dict[str, object] | None = None,
        response_schema_name: str | None = None,
        usage: Usage | None = None,
    ) -> str:
        """One non-streamed answer, for structured output."""
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")
        request = self._request(messages)
        if response_schema is not None:
            request["outputConfig"] = {
                "textFormat": {
                    "type": "json_schema",
                    "structure": {
                        "jsonSchema": {
                            "name": response_schema_name or "structured_response",
                            "description": "Structured response",
                            "schema": json.dumps(response_schema),
                        }
                    },
                }
            }
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

    async def converse(
        self,
        system: Sequence[str],
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolSpec],
        *,
        usage: Usage | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """One tool-using step through `converse_stream` with `toolConfig`."""
        if not self.is_configured:
            raise ProviderUnavailable("AI provider not configured")

        request = self._agent_request(system, messages, tools)
        yielded = False
        for delay in self._retry.delays():
            try:
                async for item in self._converse_once(request, usage):
                    yielded = True
                    yield item
                return
            except (ClientError, BotoCoreError) as exc:
                # Retrying after partial output would duplicate text or calls.
                if yielded or delay is None or not is_retryable(exc):
                    logger.error("Bedrock request failed: %s", exc)
                    raise ProviderUnavailable(UPSTREAM_ERROR_MESSAGE) from exc
                logger.warning("Bedrock error (%s); retrying in %.0fs", exc, delay)
                await asyncio.sleep(delay)

    def _inference_config(self) -> dict[str, Any]:
        # Claude 4.5+ rejects a request that sets both temperature and
        # top_p, so only the temperature travels (CHAT_TOP_P is NVIDIA's).
        return {
            "maxTokens": self._params.max_tokens,
            "temperature": self._params.temperature,
        }

    def _agent_request(
        self,
        system: Sequence[str],
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolSpec],
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "modelId": self._model,
            "messages": _agent_messages(messages),
            "inferenceConfig": self._inference_config(),
        }
        blocks = [{"text": text} for text in system if text.strip()]
        if blocks:
            request["system"] = blocks
        # Converse refuses a conversation holding toolUse / toolResult blocks
        # without the same toolConfig, so every step carries it.
        if tools:
            request["toolConfig"] = _tool_config(tools)
        return request

    async def _converse_once(
        self, request: dict[str, Any], usage: Usage | None
    ) -> AsyncIterator[AgentEvent]:
        response = await asyncio.to_thread(self._client.converse_stream, **request)
        events: Iterator[Any] = iter(response["stream"])
        # contentBlockIndex -> (toolUseId, name, input fragments)
        pending: dict[int, tuple[str, str, list[str]]] = {}
        stop_reason: StopReason = "other"
        while True:
            event: Any = await asyncio.to_thread(next, events, _END)
            if event is _END:
                break
            if "contentBlockStart" in event:
                start = event["contentBlockStart"]
                tool_use = start.get("start", {}).get("toolUse")
                if tool_use:
                    pending[start.get("contentBlockIndex", 0)] = (
                        str(tool_use.get("toolUseId", "")),
                        str(tool_use.get("name", "")),
                        [],
                    )
            elif "contentBlockDelta" in event:
                block = event["contentBlockDelta"]
                delta = block.get("delta", {})
                index = block.get("contentBlockIndex", 0)
                if delta.get("text"):
                    yield TextDelta(delta["text"])
                elif "toolUse" in delta and index in pending:
                    pending[index][2].append(str(delta["toolUse"].get("input", "")))
            elif "contentBlockStop" in event:
                index = event["contentBlockStop"].get("contentBlockIndex", 0)
                if index in pending:
                    yield ToolCallReady(_tool_call(*pending.pop(index)))
            elif "messageStop" in event:
                reason = str(event["messageStop"].get("stopReason", ""))
                stop_reason = _STOP_REASONS.get(reason, "other")
            elif "metadata" in event:
                _extract_delta(event, self._model, usage)
        # A tool block cut short (max_tokens) may never see its stop: its
        # partial input travels as `_raw`, which the caller answers as an error.
        for index in sorted(pending):
            yield ToolCallReady(_tool_call(*pending[index]))
        yield StepEnd(stop_reason)

    def _request(self, messages: Sequence[Message]) -> dict[str, Any]:
        system, turns = _converse_messages(messages)
        request: dict[str, Any] = {
            "modelId": self._model,
            "messages": turns,
            "inferenceConfig": self._inference_config(),
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

    Converse wants a first user turn, alternating roles and no blank text, so same-role
    turns merge into one message, and a leading assistant turn and blank turns drop.
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


def _tool_config(tools: Sequence[ToolSpec]) -> dict[str, Any]:
    return {
        "tools": [
            {
                "toolSpec": {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": {"json": tool.input_schema},
                }
            }
            for tool in tools
        ],
        "toolChoice": {"auto": {}},
    }


def _agent_messages(messages: Sequence[AgentMessage]) -> list[dict[str, Any]]:
    """Our agent turns as Converse messages, merged like `_converse_messages`.

    An assistant turn is its non-blank text then one `toolUse` block per call; a user
    turn is one `toolResult` block per result then its text.
    """
    turns: list[dict[str, Any]] = []
    for message in messages:
        content = _agent_blocks(message)
        if not content:
            continue
        if not turns and message.role != "user":
            continue
        if turns and turns[-1]["role"] == message.role:
            turns[-1]["content"].extend(content)
        else:
            turns.append({"role": message.role, "content": content})
    return turns


def _agent_blocks(message: AgentMessage) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    if message.role == "user":
        for result in message.tool_results:
            tool_result: dict[str, Any] = {
                "toolUseId": result.call_id,
                "content": [{"text": result.content}],
            }
            if result.is_error:
                tool_result["status"] = "error"
            blocks.append({"toolResult": tool_result})
    if message.text.strip():
        blocks.append({"text": message.text})
    if message.role == "assistant":
        blocks.extend(
            {
                "toolUse": {
                    "toolUseId": call.id,
                    "name": call.name,
                    "input": call.arguments,
                }
            }
            for call in message.tool_calls
        )
    return blocks


def _tool_call(call_id: str, name: str, fragments: Sequence[str]) -> ToolCall:
    """A complete call: its `toolUse.input` fragments joined and parsed."""
    return parse_tool_call(call_id, name, "".join(fragments))


def _extract_delta(
    event: Mapping[str, Any], model: str, usage: Usage | None = None
) -> str | None:
    """Text of a `contentBlockDelta`; tool-use deltas and control events yield None.

    The final `metadata` event carries the token usage: logged to reconcile with Cost
    Explorer, and copied into `usage` for the turn's trace.
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
        if reported:
            usage.input_tokens = reported.get("inputTokens")
            usage.output_tokens = reported.get("outputTokens")


def _output_text(response: Mapping[str, Any]) -> str:
    blocks = response.get("output", {}).get("message", {}).get("content", [])
    return "".join(block.get("text", "") for block in blocks).strip()
