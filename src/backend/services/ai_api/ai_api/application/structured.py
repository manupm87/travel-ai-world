"""Structured output: a validated model out of one `LLMProvider.complete` call.

The adapters stay text in, text out. This asks for JSON that matches a
schema, parses whatever came back (with or without code fences, with or
without chatter around it), validates it, and on failure sends the error
back once so the model can repair its answer. A second failure is the
provider's problem: `ProviderUnavailable`, which the stream reports as such.
Every call is one `llm` span of the request's trace (ADR 0024).
"""

import json
import logging
from collections.abc import Sequence

from pydantic import BaseModel, ValidationError
from travel_common.exceptions import ProviderUnavailable

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

REPAIR_INSTRUCTION = (
    "That answer was not valid JSON for the schema: {error}\n"
    "Reply again with only the corrected JSON object."
)

INVALID_ANSWER_MESSAGE = "The AI model did not return a usable answer"


class NotJson(ValueError):
    """The text held no JSON object."""


def extract_json(text: str) -> dict[str, object]:
    """The first JSON object in `text`, fences and surrounding prose ignored."""
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
) -> T:
    """Ask for `schema`, validate, repair once, then give up.

    One `llm` span (`name`) covers both attempts: tokens summed over them,
    `attempts`, whether the answer was `repaired`, the `validation_error`.
    `template` is the prompt the messages were built from (its version).
    """
    tracer = tracer or current_tracer()
    usage = usage if usage is not None else Usage()
    payload = llm_payload(
        tracer, provider, messages, operation="structured", template=template
    )
    async with tracer.span("llm", name, schema=schema.__name__, **payload) as span:
        try:
            return await _complete_json(provider, messages, schema, usage, span)
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
) -> T:
    instruction = Message(
        "system",
        JSON_INSTRUCTION.format(schema=json.dumps(schema.model_json_schema())),
    )
    conversation = [*messages, instruction]
    span.payload["attempts"] = 1
    first = Usage()
    answer = await provider.complete(conversation, usage=first)
    span.payload["output"] = answer
    _add(usage, first)
    try:
        return schema.model_validate(extract_json(answer))
    except (NotJson, ValidationError) as exc:
        logger.warning(
            "Structured answer for %s rejected, asking for a repair: %s",
            schema.__name__,
            str(exc)[:300],
        )
        span.payload["validation_error"] = str(exc)[:VALIDATION_ERROR_CHARS]
        repair = [
            *conversation,
            Message("assistant", answer or "(empty)"),
            Message("user", REPAIR_INSTRUCTION.format(error=str(exc)[:1_000])),
        ]
    span.payload["attempts"] = 2
    second = Usage()
    answer = await provider.complete(repair, usage=second)
    span.payload["output"] = answer
    _add(usage, second)
    try:
        parsed = schema.model_validate(extract_json(answer))
    except (NotJson, ValidationError) as exc:
        logger.error(
            "Structured answer for %s rejected twice: %s", schema.__name__, exc
        )
        span.payload["validation_error"] = str(exc)[:VALIDATION_ERROR_CHARS]
        raise ProviderUnavailable(INVALID_ANSWER_MESSAGE) from exc
    span.payload["repaired"] = True
    return parsed


def _add(total: Usage, call: Usage) -> None:
    """Sum one attempt's tokens into the call's `Usage`."""
    total.model = call.model or total.model
    if call.input_tokens is not None:
        total.input_tokens = (total.input_tokens or 0) + call.input_tokens
    if call.output_tokens is not None:
        total.output_tokens = (total.output_tokens or 0) + call.output_tokens
