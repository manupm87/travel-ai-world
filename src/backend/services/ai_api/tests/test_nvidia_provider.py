"""NvidiaProvider against a mocked HTTP transport: no network, no key."""

import json

import httpx
import pytest
from ai_api.config import AISettings
from ai_api.domain.agent import (
    AgentEvent,
    AgentMessage,
    StepEnd,
    StopReason,
    TextDelta,
    ToolCall,
    ToolCallReady,
    ToolResult,
    ToolSpec,
)
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.nvidia_provider import (
    UPSTREAM_ERROR_MESSAGE,
    NvidiaProvider,
)
from ai_api.infrastructure.retry import RetryPolicy
from ai_api.infrastructure.sse import SSEParser
from travel_common.exceptions import ProviderUnavailable

UPSTREAM_STREAM = (
    'data: {"choices": [{"delta": {"role": "assistant", "content": ""}}]}\n\n'
    'data: {"choices": [{"delta": {"reasoning_content": "thinking..."}}]}\n\n'
    'data: {"choices": [{"delta": {"content": "Ho"}}]}\n\n'
    'data: {"choices": [{"delta": {"text": "la"}}]}\n\n'
    "data: not-json\n\n"
    "data: [DONE]\n\n"
)


def _provider(handler, retries: int = 0, **kwargs) -> NvidiaProvider:
    model = kwargs.pop("model", "m")
    return NvidiaProvider(
        api_key="k",
        base_url="https://nvidia.test/v1",
        model=model,
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        retry=RetryPolicy(max_retries=retries, base_delay=0),
        **kwargs,
    )


async def _collect(provider: NvidiaProvider) -> list[str]:
    return [d async for d in provider.stream([Message("user", "hi")])]


async def test_streams_deltas_from_content_and_text_fields_only():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, text=UPSTREAM_STREAM)

    provider = _provider(
        handler, params=GenerationParams(max_tokens=64, temperature=0.1)
    )

    assert await _collect(provider) == ["Ho", "la"]
    assert seen[0]["model"] == "m"
    assert seen[0]["stream"] is True
    assert seen[0]["messages"] == [{"role": "user", "content": "hi"}]
    assert seen[0]["max_tokens"] == 64
    assert seen[0]["temperature"] == 0.1
    assert seen[0]["top_p"] == 0.95
    assert seen[0]["chat_template_kwargs"] == {"enable_thinking": False}
    assert seen[0]["stream_options"] == {"include_usage": True}


async def test_the_usage_chunk_reaches_the_caller():
    stream = (
        'data: {"choices": [{"delta": {"content": "Hola"}}]}\n\n'
        'data: {"choices": [], "usage": {"prompt_tokens": 9, "completion_tokens": 4}}\n\n'
        "data: [DONE]\n\n"
    )
    provider = _provider(lambda request: httpx.Response(200, text=stream))
    usage = Usage()

    deltas = [d async for d in provider.stream([Message("user", "hi")], usage=usage)]

    assert deltas == ["Hola"]
    assert usage == Usage(model="m", input_tokens=9, output_tokens=4)


async def test_thinking_flag_reaches_the_payload():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, text=UPSTREAM_STREAM)

    await _collect(_provider(handler, thinking=True))

    assert seen[0]["chat_template_kwargs"] == {"enable_thinking": True}


async def test_glm_stream_limits_reasoning_and_clears_hidden_thinking():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, text=UPSTREAM_STREAM)

    provider = _provider(handler, model="z-ai/glm-5.3-flash")

    assert await _collect(provider) == ["Ho", "la"]
    assert seen[0]["reasoning_effort"] == "low"
    assert seen[0]["chat_template_kwargs"] == {
        "enable_thinking": False,
        "clear_thinking": True,
    }


def test_from_settings_reads_model_and_thinking():
    provider = NvidiaProvider.from_settings(
        AISettings(NVIDIA_API_KEY="k", NVIDIA_CHAT_MODEL="m", NVIDIA_THINKING=True)
    )

    assert provider._model == "m"
    assert provider._thinking is True


def test_settings_load_env_file_from_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "LLM_PROVIDER=nvidia\n"
        "NVIDIA_API_KEY=test-key\n"
        "NVIDIA_CHAT_MODEL=z-ai/glm-5.3-flash\n"
    )

    settings = AISettings()

    assert settings.LLM_PROVIDER == "nvidia"
    assert settings.NVIDIA_API_KEY == "test-key"
    assert settings.NVIDIA_CHAT_MODEL == "z-ai/glm-5.3-flash"


async def test_reuses_one_client_across_calls():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, text=UPSTREAM_STREAM)

    provider = _provider(handler)
    await _collect(provider)
    await _collect(provider)

    assert calls == 2
    assert not provider._client.is_closed
    await provider.aclose()
    assert provider._client.is_closed


async def test_retries_a_failed_connection_then_succeeds():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(502, text="bad gateway")
        return httpx.Response(200, text=UPSTREAM_STREAM)

    assert await _collect(_provider(handler, retries=1)) == ["Ho", "la"]
    assert attempts == 2


async def test_gives_up_after_last_retry_without_leaking_the_upstream_body():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="secret internal detail")

    with pytest.raises(ProviderUnavailable) as info:
        await _collect(_provider(handler, retries=1))

    assert info.value.message == UPSTREAM_ERROR_MESSAGE
    assert "secret" not in str(info.value)


async def test_unconfigured_provider_refuses_immediately():
    provider = NvidiaProvider(
        api_key="", base_url="https://x", model="m", client=httpx.AsyncClient()
    )

    with pytest.raises(ProviderUnavailable):
        await _collect(provider)


def test_from_settings_reads_sampling_and_timeouts():
    settings = AISettings(
        NVIDIA_API_KEY="k",
        CHAT_MAX_TOKENS=12,
        CHAT_TEMPERATURE=0.2,
        CHAT_TOP_P=0.5,
        NVIDIA_MAX_RETRIES=5,
        NVIDIA_READ_TIMEOUT=7.0,
    )

    provider = NvidiaProvider.from_settings(settings)

    assert provider.is_configured
    assert provider._params == GenerationParams(
        max_tokens=12, temperature=0.2, top_p=0.5
    )
    assert provider._retry.max_retries == 5
    assert provider._client.timeout.read == 7.0


def test_sse_parser_reassembles_lines_split_across_chunks():
    parser = SSEParser()

    assert parser.feed('data: {"a"') == []
    assert parser.feed(": 1}\n\ndata: [DO") == ['{"a": 1}']
    assert parser.feed("NE]\n") == ["[DONE]"]


COMPLETION = {
    "choices": [{"message": {"role": "assistant", "content": '{"title": "Madrid"}'}}],
    "usage": {"prompt_tokens": 31, "completion_tokens": 7},
}


async def test_complete_returns_the_whole_answer_with_its_usage():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, json=COMPLETION)

    usage = Usage()
    provider = _provider(handler)

    answer = await provider.complete([Message("user", "título")], usage=usage)

    assert answer == '{"title": "Madrid"}'
    assert usage == Usage(model="m", input_tokens=31, output_tokens=7)
    # Structured output is parsed whole: nothing is streamed.
    assert seen[0]["stream"] is False
    assert "stream_options" not in seen[0]
    assert seen[0]["messages"] == [{"role": "user", "content": "título"}]


async def test_complete_sends_native_schema_for_glm():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, json=COMPLETION)

    schema = {"type": "object", "properties": {"title": {"type": "string"}}}
    provider = _provider(handler, model="z-ai/glm-5.3-flash")

    await provider.complete(
        [Message("user", "título")],
        response_schema=schema,
        response_schema_name="Title",
    )

    assert provider.supports_structured_outputs is True
    assert seen[0]["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "Title", "strict": True, "schema": schema},
    }
    assert seen[0]["reasoning_effort"] == "low"
    assert seen[0]["chat_template_kwargs"] == {
        "enable_thinking": False,
        "clear_thinking": True,
    }


async def test_complete_does_not_send_native_schema_for_other_models():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(__import__("json").loads(request.content))
        return httpx.Response(200, json=COMPLETION)

    await _provider(handler).complete(
        [Message("user", "título")], response_schema={"type": "object"}
    )

    assert "response_format" not in seen[0]


async def test_complete_without_choices_is_an_empty_answer():
    provider = _provider(lambda request: httpx.Response(200, json={"choices": []}))

    assert await provider.complete([Message("user", "x")]) == ""


async def test_complete_retries_a_server_error_then_succeeds():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, text="overloaded")
        return httpx.Response(200, json=COMPLETION)

    answer = await _provider(handler, retries=1).complete([Message("user", "x")])

    assert answer == '{"title": "Madrid"}'
    assert attempts == 2


async def test_complete_gives_up_after_the_last_retry():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(500, text="secret internal detail")

    with pytest.raises(ProviderUnavailable) as info:
        await _provider(handler, retries=1).complete([Message("user", "x")])

    assert attempts == 2
    assert info.value.message == UPSTREAM_ERROR_MESSAGE
    assert "secret" not in str(info.value)


async def test_complete_refuses_when_the_provider_is_not_configured():
    provider = NvidiaProvider(
        api_key="", base_url="https://x", model="m", client=httpx.AsyncClient()
    )

    with pytest.raises(ProviderUnavailable):
        await provider.complete([Message("user", "x")])


# ─── Tool use (converse, ADR 0032) ──────────────────────────────────────────

WEATHER = ToolSpec(
    name="get_weather",
    description="The forecast of a city.",
    input_schema={
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
        "additionalProperties": False,
    },
)


def _sse(*chunks: dict) -> str:
    lines = [f"data: {json.dumps(chunk)}\n\n" for chunk in chunks]
    return "".join(lines) + "data: [DONE]\n\n"


def _delta(finish: str | None = None, **delta: object) -> dict:
    return {"choices": [{"delta": delta, "finish_reason": finish}]}


def _fragment(index: int, *, call_id=None, name=None, arguments=None) -> dict:
    function: dict = {}
    if name is not None:
        function["name"] = name
    if arguments is not None:
        function["arguments"] = arguments
    fragment: dict = {"index": index, "function": function}
    if call_id is not None:
        fragment["id"] = call_id
        fragment["type"] = "function"
    return fragment


# Text, then two calls whose fragments interleave, then the usage chunk.
TOOL_STREAM = _sse(
    _delta(content="Let me "),
    _delta(content="check."),
    _delta(tool_calls=[_fragment(0, call_id="c-1", name="get_weather")]),
    _delta(tool_calls=[_fragment(0, arguments='{"ci')]),
    _delta(tool_calls=[_fragment(1, call_id="c-2", name="get_weather")]),
    _delta(tool_calls=[_fragment(0, arguments='ty": "Budapest"}')]),
    _delta(tool_calls=[_fragment(1, arguments='{"city": "Bologna"}')]),
    _delta(finish="tool_calls"),
    {"choices": [], "usage": {"prompt_tokens": 30, "completion_tokens": 7}},
)


async def _converse(
    provider: NvidiaProvider,
    messages: list[AgentMessage] | None = None,
    usage: Usage | None = None,
) -> list[AgentEvent]:
    turns = messages or [AgentMessage("user", "weather?")]
    return [
        item
        async for item in provider.converse(["be brief"], turns, [WEATHER], usage=usage)
    ]


async def test_converse_streams_text_and_assembles_fragmented_calls():
    usage = Usage()
    provider = _provider(lambda request: httpx.Response(200, text=TOOL_STREAM))

    items = await _converse(provider, usage=usage)

    assert items == [
        TextDelta("Let me "),
        TextDelta("check."),
        ToolCallReady(ToolCall("c-1", "get_weather", {"city": "Budapest"})),
        ToolCallReady(ToolCall("c-2", "get_weather", {"city": "Bologna"})),
        StepEnd("tool_use"),
    ]
    assert usage == Usage(model="m", input_tokens=30, output_tokens=7)


async def test_converse_payload_carries_tools_and_openai_messages():
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, text=TOOL_STREAM)

    call = ToolCall("c-1", "get_weather", {"city": "Budapest"})
    await _converse(
        _provider(handler),
        [
            AgentMessage("user", "weather?"),
            AgentMessage("assistant", "", tool_calls=(call,)),
            AgentMessage(
                "user",
                tool_results=(ToolResult("c-1", '{"error": "down"}', is_error=True),),
            ),
        ],
    )

    payload = seen[0]
    assert payload["stream"] is True
    assert payload["stream_options"] == {"include_usage": True}
    assert payload["tool_choice"] == "auto"
    assert payload["tools"] == [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "The forecast of a city.",
                "parameters": WEATHER.input_schema,
            },
        }
    ]
    assert payload["messages"] == [
        {"role": "system", "content": "be brief"},
        {"role": "user", "content": "weather?"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "c-1",
                    "type": "function",
                    "function": {
                        "name": "get_weather",
                        "arguments": '{"city": "Budapest"}',
                    },
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c-1", "content": '{"error": "down"}'},
    ]


async def test_converse_malformed_arguments_are_kept_raw():
    stream = _sse(
        _delta(tool_calls=[_fragment(0, call_id="c-1", name="get_weather")]),
        _delta(tool_calls=[_fragment(0, arguments='{"city": Buda')]),
        _delta(finish="tool_calls"),
    )
    provider = _provider(lambda request: httpx.Response(200, text=stream))

    items = await _converse(provider)

    assert items == [
        ToolCallReady(ToolCall("c-1", "get_weather", {"_raw": '{"city": Buda'})),
        StepEnd("tool_use"),
    ]


async def test_converse_call_without_arguments_or_id_still_completes():
    stream = _sse(
        _delta(tool_calls=[_fragment(0, name="get_weather")]),
        _delta(finish="stop"),
    )
    provider = _provider(lambda request: httpx.Response(200, text=stream))

    items = await _converse(provider)

    # A step that called a tool is a tool-use step, whatever finish it reports.
    assert items == [
        ToolCallReady(ToolCall("call_0", "get_weather", {})),
        StepEnd("tool_use"),
    ]


@pytest.mark.parametrize(
    ("finish", "expected"),
    [
        ("stop", "end_turn"),
        ("length", "max_tokens"),
        ("content_filter", "other"),
        (None, "other"),
    ],
)
async def test_converse_maps_finish_reasons(finish: str | None, expected: StopReason):
    stream = _sse(_delta(content="ok"), _delta(finish=finish))
    provider = _provider(lambda request: httpx.Response(200, text=stream))

    assert await _converse(provider) == [TextDelta("ok"), StepEnd(expected)]


async def test_converse_retries_before_the_first_item():
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(502, text="bad gateway")
        return httpx.Response(200, text=TOOL_STREAM)

    items = await _converse(_provider(handler, retries=1))

    assert items[-1] == StepEnd("tool_use")
    assert attempts == 2


async def test_converse_does_not_retry_after_the_first_item():
    attempts = 0

    class Broken(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield f"data: {json.dumps(_delta(content='Ho'))}\n\n".encode()
            raise httpx.ReadError("connection dropped")

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(200, stream=Broken())

    seen: list[AgentEvent] = []
    with pytest.raises(ProviderUnavailable):
        async for item in _provider(handler, retries=2).converse(
            [], [AgentMessage("user", "hi")], [WEATHER]
        ):
            seen.append(item)

    assert seen == [TextDelta("Ho")]
    assert attempts == 1


async def test_converse_refuses_when_the_provider_is_not_configured():
    provider = NvidiaProvider(
        api_key="",
        base_url="https://nvidia.test/v1",
        model="m",
        client=httpx.AsyncClient(),
    )

    with pytest.raises(ProviderUnavailable):
        await _converse(provider)


def test_tool_use_is_limited_to_the_verified_models():
    handler = lambda request: httpx.Response(200)  # noqa: E731
    assert _provider(handler).supports_tools is False
    # GLM is unverified (the probe timed out), so it does not call tools yet.
    assert _provider(handler, model="z-ai/glm-5.3-flash").supports_tools is False
