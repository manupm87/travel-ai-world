"""NvidiaProvider against a mocked HTTP transport: no network, no key."""

import httpx
import pytest
from ai_api.config import AISettings
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
    return NvidiaProvider(
        api_key="k",
        base_url="https://nvidia.test/v1",
        model="m",
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


def test_from_settings_reads_model_and_thinking():
    provider = NvidiaProvider.from_settings(
        AISettings(NVIDIA_API_KEY="k", NVIDIA_CHAT_MODEL="m", NVIDIA_THINKING=True)
    )

    assert provider._model == "m"
    assert provider._thinking is True


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
