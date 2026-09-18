"""Structured output: a validated model out of one `LLMProvider.complete` call.

The adapters stay text in, text out. This asks for JSON that matches a
schema, parses whatever came back (with or without code fences, with or
without chatter around it), validates it, and on failure sends the error
back once so the model can repair its answer. A second failure is the
provider's problem: `ProviderUnavailable`, which the stream reports as such.
"""

import json
import logging
from collections.abc import Sequence

from pydantic import BaseModel, ValidationError
from travel_common.exceptions import ProviderUnavailable

from ai_api.domain.models import Message, Usage
from ai_api.domain.ports import LLMProvider

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
    usage: Usage | None = None,
) -> T:
    """Ask for `schema`, validate, repair once, then give up."""
    instruction = Message(
        "system",
        JSON_INSTRUCTION.format(schema=json.dumps(schema.model_json_schema())),
    )
    conversation = [*messages, instruction]
    answer = await provider.complete(conversation, usage=usage)
    try:
        return schema.model_validate(extract_json(answer))
    except (NotJson, ValidationError) as exc:
        logger.warning(
            "Structured answer for %s rejected, asking for a repair: %s",
            schema.__name__,
            str(exc)[:300],
        )
        repair = [
            *conversation,
            Message("assistant", answer or "(empty)"),
            Message("user", REPAIR_INSTRUCTION.format(error=str(exc)[:1_000])),
        ]
    answer = await provider.complete(repair, usage=usage)
    try:
        return schema.model_validate(extract_json(answer))
    except (NotJson, ValidationError) as exc:
        logger.error(
            "Structured answer for %s rejected twice: %s", schema.__name__, exc
        )
        raise ProviderUnavailable(INVALID_ANSWER_MESSAGE) from exc
