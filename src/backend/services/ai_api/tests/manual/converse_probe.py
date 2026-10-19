"""Does a model call tools through `LLMProvider.converse`? (TRA-289, ADR 0032)

    uv run python tests/manual/converse_probe.py
    uv run python tests/manual/converse_probe.py --model minimaxai/minimax-m3

Run by path, not as a module (see `planner_smoke.py`). Asks the NVIDIA model
for the weather with one `get_weather` tool offered, prints every streamed
item, then answers the call and prints the second step. A model belongs in
`nvidia_provider.TOOL_USE_MODELS` only when the first step ends with a
`ToolCallReady` for `get_weather` with a `city` argument.

Exit code 0 when the model called the tool, 1 when it did not, 2 when the
provider failed. Needs `NVIDIA_API_KEY` in `.env`.
"""

import argparse
import asyncio
import json
import sys

from ai_api.config import AISettings
from ai_api.domain.agent import (
    AgentMessage,
    TextDelta,
    ToolCall,
    ToolCallReady,
    ToolResult,
    ToolSpec,
)
from ai_api.domain.models import Usage
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from travel_common.exceptions import ProviderUnavailable

WEATHER = ToolSpec(
    name="get_weather",
    description="Today's weather forecast for a city. Use it for any weather question.",
    input_schema={
        "type": "object",
        "properties": {"city": {"type": "string", "description": "City name."}},
        "required": ["city"],
        "additionalProperties": False,
    },
)
SYSTEM = ["You are a travel assistant. Use the tools you are given; never guess."]
QUESTION = "What's the weather like in Budapest today?"


async def _step(
    provider: NvidiaProvider, messages: list[AgentMessage]
) -> tuple[str, list[ToolCall]]:
    usage = Usage()
    text: list[str] = []
    calls: list[ToolCall] = []
    async for item in provider.converse(SYSTEM, messages, [WEATHER], usage=usage):
        print(f"  {item!r}")
        if isinstance(item, ToolCallReady):
            calls.append(item.call)
        elif isinstance(item, TextDelta):
            text.append(item.text)
    print(f"  usage: {usage}")
    return "".join(text), calls


async def run(model: str) -> int:
    settings = AISettings(NVIDIA_CHAT_MODEL=model, LLM_PROVIDER="nvidia")
    provider = NvidiaProvider.from_settings(settings)
    print(f"model {model} (supports_tools={provider.supports_tools})")
    try:
        messages = [AgentMessage("user", QUESTION)]
        print("step 1")
        text, calls = await _step(provider, messages)
        called = any(
            c.name == "get_weather" and isinstance(c.arguments.get("city"), str)
            for c in calls
        )
        if not calls:
            print("RESULT: no tool call")
            return 1
        messages += [
            AgentMessage("assistant", text, tool_calls=tuple(calls)),
            AgentMessage(
                "user",
                tool_results=tuple(
                    ToolResult(c.id, json.dumps({"temp_c": 21, "sky": "sunny"}))
                    for c in calls
                ),
            ),
        ]
        print("step 2")
        await _step(provider, messages)
    except ProviderUnavailable as exc:
        print(f"RESULT: provider failed: {exc}")
        return 2
    finally:
        await provider.aclose()
    print(f"RESULT: {'tool called' if called else 'unexpected call'}")
    return 0 if called else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Probe a model's tool calls.")
    parser.add_argument("--model", default="z-ai/glm-5.3-flash")
    return asyncio.run(run(parser.parse_args(argv).model))


if __name__ == "__main__":
    sys.exit(main())
