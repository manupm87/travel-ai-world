"""BedrockProvider against a fake `bedrock-runtime` client: no network, no credentials."""

from collections.abc import Iterator
from typing import Any

import pytest
from ai_api.config import AISettings
from ai_api.domain.models import GenerationParams, Message, Usage
from ai_api.infrastructure.bedrock_provider import (
    UPSTREAM_ERROR_MESSAGE,
    BedrockProvider,
)
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from ai_api.infrastructure.providers import build_llm_provider
from ai_api.infrastructure.retry import RetryPolicy
from botocore.exceptions import ClientError, EndpointConnectionError
from travel_common.exceptions import ProviderUnavailable

# What Converse streams for a two-token answer, control events included.
STREAM_EVENTS: list[dict[str, Any]] = [
    {"messageStart": {"role": "assistant"}},
    {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": "Ho"}}},
    {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": "la"}}},
    {
        "contentBlockDelta": {
            "contentBlockIndex": 1,
            "delta": {"toolUse": {"input": "{}"}},
        }
    },
    {"contentBlockStop": {"contentBlockIndex": 0}},
    {"messageStop": {"stopReason": "end_turn"}},
    {"metadata": {"usage": {"inputTokens": 12, "outputTokens": 2}}},
]


def _client_error(code: str) -> ClientError:
    return ClientError(
        {"Error": {"Code": code, "Message": "upstream detail"}}, "Converse"
    )


class FakeClient:
    """Answers each call with the next outcome: a list of events, a response
    dict, or an exception to raise."""

    def __init__(self, *outcomes: Any) -> None:
        self.outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    def converse_stream(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return {"stream": iter(outcome)}

    def converse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def _provider(client: FakeClient, retries: int = 0, **kwargs: Any) -> BedrockProvider:
    return BedrockProvider(
        client=client,
        model="eu.anthropic.test",
        retry=RetryPolicy(max_retries=retries, base_delay=0),
        **kwargs,
    )


async def _collect(provider: BedrockProvider, *messages: Message) -> list[str]:
    turns = list(messages) or [Message("user", "hi")]
    return [delta async for delta in provider.stream(turns)]


async def test_streams_text_deltas_only():
    client = FakeClient(STREAM_EVENTS)

    assert await _collect(_provider(client)) == ["Ho", "la"]


async def test_usage_from_the_metadata_event_reaches_the_caller():
    usage = Usage()
    provider = _provider(FakeClient(STREAM_EVENTS))

    deltas = [d async for d in provider.stream([Message("user", "hi")], usage=usage)]

    assert deltas == ["Ho", "la"]
    assert usage == Usage(model="eu.anthropic.test", input_tokens=12, output_tokens=2)


async def test_request_maps_system_turns_and_sampling():
    client = FakeClient(STREAM_EVENTS)
    provider = _provider(
        client, params=GenerationParams(max_tokens=64, temperature=0.1)
    )

    await _collect(
        provider,
        Message("system", "be helpful"),
        Message("system", "Use this background information:\nMadrid"),
        Message("user", "hola"),
        Message("assistant", "hola,"),
        Message("assistant", "¿qué tal?"),
        Message("user", "bien"),
    )

    request = client.calls[0]
    assert request["modelId"] == "eu.anthropic.test"
    assert request["system"] == [
        {"text": "be helpful"},
        {"text": "Use this background information:\nMadrid"},
    ]
    # Consecutive same-role turns collapse into one message with two blocks.
    assert request["messages"] == [
        {"role": "user", "content": [{"text": "hola"}]},
        {"role": "assistant", "content": [{"text": "hola,"}, {"text": "¿qué tal?"}]},
        {"role": "user", "content": [{"text": "bien"}]},
    ]
    # Claude 4.5+ refuses temperature together with top_p: only temperature travels.
    assert request["inferenceConfig"] == {"maxTokens": 64, "temperature": 0.1}


async def test_drops_leading_assistant_and_blank_turns():
    client = FakeClient(STREAM_EVENTS)

    await _collect(
        _provider(client),
        Message("assistant", "stale reply"),
        Message("user", "   "),
        Message("user", "hola"),
    )

    assert client.calls[0]["messages"] == [
        {"role": "user", "content": [{"text": "hola"}]}
    ]
    assert "system" not in client.calls[0]


async def test_retries_throttling_then_succeeds():
    client = FakeClient(_client_error("ThrottlingException"), STREAM_EVENTS)

    assert await _collect(_provider(client, retries=1)) == ["Ho", "la"]
    assert len(client.calls) == 2


async def test_retries_a_connection_error():
    client = FakeClient(
        EndpointConnectionError(endpoint_url="https://bedrock"), STREAM_EVENTS
    )

    assert await _collect(_provider(client, retries=1)) == ["Ho", "la"]
    assert len(client.calls) == 2


async def test_access_denied_is_not_retried_and_stays_out_of_the_message():
    client = FakeClient(_client_error("AccessDeniedException"))

    with pytest.raises(ProviderUnavailable) as info:
        await _collect(_provider(client, retries=2))

    assert len(client.calls) == 1
    assert info.value.message == UPSTREAM_ERROR_MESSAGE
    assert "upstream detail" not in str(info.value)


async def test_no_retry_after_the_first_delta():
    def events_then_failure() -> Iterator[dict[str, Any]]:
        yield STREAM_EVENTS[1]
        raise _client_error("ThrottlingException")

    client = FakeClient(events_then_failure(), STREAM_EVENTS)
    seen: list[str] = []

    with pytest.raises(ProviderUnavailable):
        async for delta in _provider(client, retries=1).stream([Message("user", "hi")]):
            seen.append(delta)

    assert seen == ["Ho"]
    assert len(client.calls) == 1


async def test_complete_joins_text_blocks_and_honours_the_model_override():
    client = FakeClient(
        {"output": {"message": {"content": [{"text": "Viaje"}, {"text": " a Madrid"}]}}}
    )
    provider = _provider(client)

    title = await provider.complete(
        [Message("user", "título")], model="eu.amazon.nova-lite-v1:0", max_tokens=32
    )

    assert title == "Viaje a Madrid"
    assert client.calls[0]["modelId"] == "eu.amazon.nova-lite-v1:0"
    assert client.calls[0]["inferenceConfig"]["maxTokens"] == 32


async def test_complete_maps_failures_to_provider_unavailable():
    client = FakeClient(_client_error("ValidationException"))

    with pytest.raises(ProviderUnavailable):
        await _provider(client, retries=1).complete([Message("user", "x")])

    assert len(client.calls) == 1


async def test_unconfigured_provider_refuses_immediately():
    provider = BedrockProvider(client=FakeClient(), model="")

    with pytest.raises(ProviderUnavailable):
        await _collect(provider)


def test_from_settings_builds_a_client_without_credentials_or_network():
    settings = AISettings(
        BEDROCK_CHAT_MODEL="m",
        BEDROCK_REGION="eu-west-1",
        CHAT_MAX_TOKENS=12,
        CHAT_TEMPERATURE=0.2,
        BEDROCK_MAX_RETRIES=5,
    )

    provider = BedrockProvider.from_settings(settings)

    assert provider.is_configured
    assert provider._model == "m"
    assert provider._params.max_tokens == 12
    assert provider._params.temperature == 0.2
    assert provider._retry.max_retries == 5
    assert provider._client.meta.region_name == "eu-west-1"  # type: ignore[attr-defined]


async def test_build_llm_provider_picks_the_adapter_by_setting():
    bedrock = build_llm_provider(AISettings(LLM_PROVIDER="bedrock"))
    nvidia = build_llm_provider(AISettings(NVIDIA_API_KEY="k"))

    assert isinstance(bedrock, BedrockProvider)
    assert isinstance(nvidia, NvidiaProvider)
    assert (bedrock.name, nvidia.name) == ("bedrock", "nvidia")
    await nvidia.aclose()


async def test_complete_records_the_usage_the_response_reports():
    client = FakeClient(
        {
            "output": {
                "message": {"content": [{"text": "Viaje"}, {"text": " a Roma"}]}
            },
            "usage": {"inputTokens": 41, "outputTokens": 5},
        }
    )
    usage = Usage()

    answer = await _provider(client).complete([Message("user", "título")], usage=usage)

    assert answer == "Viaje a Roma"
    assert usage == Usage(model="eu.anthropic.test", input_tokens=41, output_tokens=5)


async def test_complete_refuses_when_the_provider_is_not_configured():
    provider = BedrockProvider(client=FakeClient(), model="")

    with pytest.raises(ProviderUnavailable):
        await provider.complete([Message("user", "x")])
