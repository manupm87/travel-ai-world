"""`testing.FakeProvider.converse`: scripted tool-using steps."""

from ai_api.domain.agent import (
    AgentMessage,
    StepEnd,
    TextDelta,
    ToolCall,
    ToolCallReady,
    ToolSpec,
)
from ai_api.domain.models import Usage
from ai_api.testing import FakeProvider, tool_call

SPEC = ToolSpec("search_places", "Search the corpus.", {"type": "object"})


async def _step(provider: FakeProvider, text: str, usage: Usage | None = None):
    return [
        item
        async for item in provider.converse(
            ["sys"], [AgentMessage("user", text)], [SPEC], usage=usage
        )
    ]


async def test_steps_pop_in_order_and_conversations_are_recorded():
    call = tool_call("search_places", id="c-1", query="baths")
    provider = FakeProvider(steps=[["Looking.", call], ["Found it."]])

    first = await _step(provider, "one")
    second = await _step(provider, "two")

    assert first == [TextDelta("Looking."), ToolCallReady(call), StepEnd("tool_use")]
    assert second == [TextDelta("Found it."), StepEnd("end_turn")]
    assert provider.steps == []
    assert provider.conversations == [
        (["sys"], [AgentMessage("user", "one")], [SPEC]),
        (["sys"], [AgentMessage("user", "two")], [SPEC]),
    ]


async def test_without_steps_left_it_streams_the_deltas_and_ends_the_turn():
    usage = Usage()
    provider = FakeProvider(deltas=["Hola", " mundo"])

    items = await _step(provider, "hi", usage)

    assert items == [TextDelta("Hola"), TextDelta(" mundo"), StepEnd("end_turn")]
    assert usage == Usage(model="fake-model", input_tokens=3, output_tokens=2)


def test_tool_call_helper_makes_up_distinct_ids():
    first = tool_call("get_place", place_id="a")
    second = tool_call("get_place", place_id="a")

    assert first.arguments == {"place_id": "a"}
    assert first.id != second.id
    assert tool_call("x", id="fixed") == ToolCall("fixed", "x", {})


def test_tools_are_supported_by_default():
    assert FakeProvider().supports_tools is True
    assert FakeProvider(supports_tools=False).supports_tools is False
