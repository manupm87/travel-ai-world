"""Structured output: a validated model out of one `LLMProvider.complete` call.

Providers that support JSON Schema constrain the answer natively; other
models receive a prompt instruction. Pydantic validation remains the semantic
check, and planner use cases own deterministic fallbacks. Every call is one
`llm` span of the request's trace (ADR 0024).
"""

import json
import logging
from collections.abc import Sequence

from pydantic import BaseModel, ValidationError
from travel_common.exceptions import DomainError, ProviderUnavailable

from ai_api.application.tracing import (
    VALIDATION_ERROR_CHARS,
    TurnTracer,
    current_tracer,
    fill_usage,
    llm_payload,
)
from ai_api.domain.models import Message, Usage
from ai_api.domain.ports import LLMProvider
from ai_api.domain.tracing import Span

logger = logging.getLogger(__name__)

JSON_INSTRUCTION = (
    "Answer with a single JSON object and nothing else: no prose before or "
    "after it, no code fences. It must match this JSON schema exactly (every "
    "required key present, no extra keys):\n{schema}"
)

INVALID_ANSWER_MESSAGE = "The AI model did not return a usable answer"
_UNSUPPORTED_SCHEMA_KEYS = {
    "default",
    "exclusiveMaximum",
    "exclusiveMinimum",
    "maximum",
    "maxItems",
    "maxLength",
    "minimum",
    "minLength",
    "multipleOf",
    "pattern",
}


class NotJson(ValueError):
    """The text held no JSON object."""


def extract_json(text: str) -> dict[str, object]:
    """The JSON object in `text`, from its first `{` to its last `}`: fences and
    surrounding prose are ignored."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise NotJson("no JSON object in the answer")
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise NotJson(str(exc)) from exc
    if not isinstance(parsed, dict):
        raise NotJson("the JSON is not an object")
    return parsed


async def complete_json[T: BaseModel](
    provider: LLMProvider,
    messages: Sequence[Message],
    schema: type[T],
    *,
    name: str,
    usage: Usage | None = None,
    tracer: TurnTracer | None = None,
    template: str | None = None,
    fallback_on_error: bool = False,
) -> T:
    """Ask for `schema` once and validate; the caller owns any fallback.

    One `llm` span (`name`) records its mechanism, validation error and whether
    the caller's deterministic fallback was needed.
    `template` is the prompt the messages were built from (its version).
    """
    tracer = tracer or current_tracer()
    usage = usage if usage is not None else Usage()
    payload = llm_payload(
        tracer, provider, messages, operation="structured", template=template
    )
    async with tracer.span("llm", name, schema=schema.__name__, **payload) as span:
        try:
            return await _complete_json(
                provider, messages, schema, usage, span, fallback_on_error
            )
        finally:
            fill_usage(span, usage)
            span.payload["output"], span.payload["output_truncated"] = tracer.clip(
                span.payload.get("output")
            )


async def _complete_json[T: BaseModel](
    provider: LLMProvider,
    messages: Sequence[Message],
    schema: type[T],
    usage: Usage,
    span: Span,
    fallback_on_error: bool,
) -> T:
    native = provider.supports_structured_outputs
    response_schema = _provider_schema(schema) if native else None
    conversation = list(messages)
    if not native:
        conversation.append(
            Message(
                "system",
                JSON_INSTRUCTION.format(schema=json.dumps(schema.model_json_schema())),
            )
        )
    span.payload["mechanism"] = "native_json_schema" if native else "prompt"
    span.payload["attempts"] = 1
    call = Usage()
    try:
        answer = await provider.complete(
            conversation,
            response_schema=response_schema,
            response_schema_name=schema.__name__ if native else None,
            usage=call,
        )
    except DomainError:
        span.payload["fallback_used"] = fallback_on_error
        raise
    span.payload["output"] = answer
    try:
        parsed = _strict_json(answer) if native else extract_json(answer)
        return schema.model_validate(parsed)
    except (NotJson, ValidationError) as exc:
        span.payload["validation_error"] = str(exc)[:VALIDATION_ERROR_CHARS]
        span.payload["fallback_used"] = fallback_on_error
        logger.warning("Structured answer for %s rejected: %s", schema.__name__, exc)
        raise ProviderUnavailable(INVALID_ANSWER_MESSAGE) from exc
    finally:
        _add(usage, call)


def _strict_json(text: str) -> dict[str, object]:
    """Parse a native structured answer without tolerating surrounding prose."""
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise NotJson(str(exc)) from exc
    if not isinstance(parsed, dict):
        raise NotJson("the JSON is not an object")
    return parsed


def _provider_schema[T: BaseModel](schema: type[T]) -> dict[str, object]:
    """Make Pydantic's schema strict while omitting provider-unsupported limits.

    Pydantic still validates the complete model after generation, including
    constraints omitted here for Bedrock's supported JSON Schema subset.
    """
    result = schema.model_json_schema()
    _normalize_schema(result)
    return result


def _normalize_schema(node: object) -> None:
    if isinstance(node, dict):
        for key in _UNSUPPORTED_SCHEMA_KEYS:
            node.pop(key, None)
        properties = node.get("properties")
        if isinstance(properties, dict):
            node["required"] = list(properties)
            node["additionalProperties"] = False
        if node.get("minItems", 0) not in (0, 1):
            node.pop("minItems", None)
        for value in node.values():
            _normalize_schema(value)
    elif isinstance(node, list):
        for value in node:
            _normalize_schema(value)


def _add(total: Usage, call: Usage) -> None:
    """Sum one attempt's tokens into the call's `Usage`."""
    total.model = call.model or total.model
    if call.input_tokens is not None:
        total.input_tokens = (total.input_tokens or 0) + call.input_tokens
    if call.output_tokens is not None:
        total.output_tokens = (total.output_tokens or 0) + call.output_tokens
