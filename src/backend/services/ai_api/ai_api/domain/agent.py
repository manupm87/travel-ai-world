"""What a tool-using conversation step is made of (ADR 0032).

A use case hands the provider a system prompt, `AgentMessage`s and the
`ToolSpec`s it may call; the provider streams `AgentEvent`s back: text as it
comes, each tool call once its input is complete, and one `StepEnd`. The
text-only `Message` of `models.py` stays as it is for every other call.
"""

import json
from dataclasses import dataclass
from typing import Literal

StopReason = Literal["end_turn", "tool_use", "max_tokens", "other"]
AgentRole = Literal["user", "assistant"]


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """A tool the model may call: `input_schema` is a JSON Schema object."""

    name: str
    description: str
    input_schema: dict[str, object]


@dataclass(frozen=True, slots=True)
class ToolCall:
    """One call the model asked for. Arguments that were not valid JSON
    arrive as `{"_raw": <text>}`; the caller answers them with an error."""

    id: str
    name: str
    arguments: dict[str, object]


@dataclass(frozen=True, slots=True)
class ToolResult:
    """What a tool answered to the call `call_id`; `content` is JSON text."""

    call_id: str
    content: str
    is_error: bool = False


@dataclass(frozen=True, slots=True)
class AgentMessage:
    """One turn of a tool-using conversation.

    An assistant turn carries its text and the calls it made; the user turn
    that follows carries the results of those calls (and, at the start, the
    traveller's words as `text`).
    """

    role: AgentRole
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    tool_results: tuple[ToolResult, ...] = ()


@dataclass(frozen=True, slots=True)
class TextDelta:
    text: str


@dataclass(frozen=True, slots=True)
class ToolCallReady:
    call: ToolCall


@dataclass(frozen=True, slots=True)
class StepEnd:
    stop_reason: StopReason


AgentEvent = TextDelta | ToolCallReady | StepEnd


def parse_tool_call(call_id: str, name: str, text: str) -> ToolCall:
    """A call whose input arrived as JSON text (streamed in pieces).

    Empty input is `{}`; anything that is not a JSON object (malformed, or
    cut short by `max_tokens`) is kept as `{"_raw": text}`, which the caller
    answers with an error result instead of running the tool.
    """
    if not text.strip():
        return ToolCall(id=call_id, name=name, arguments={})
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if not isinstance(parsed, dict):
        return ToolCall(id=call_id, name=name, arguments={"_raw": text})
    return ToolCall(id=call_id, name=name, arguments=parsed)
