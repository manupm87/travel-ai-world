"""CoreApiClient against a mocked transport: core_api's answers become domain errors."""

import httpx
import pytest
from ai_api.domain.models import ChatTurn, Source
from ai_api.domain.usage import Entitlement
from ai_api.infrastructure.core_api_client import CoreApiClient
from travel_common.exceptions import (
    EntityNotFound,
    Forbidden,
    ProviderUnavailable,
    Unauthorized,
    UnprocessableEntity,
)


def _client(handler) -> CoreApiClient:
    transport = httpx.MockTransport(handler)
    return CoreApiClient(
        "http://core",
        client_factory=lambda **kw: httpx.AsyncClient(transport=transport, **kw),
    )


async def test_forwards_the_callers_token_and_returns_the_body():
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["Authorization"]
        seen["url"] = str(request.url)
        return httpx.Response(201, json={"id": 7})

    assert await _client(handler).start_thread("tok") == "7"
    assert seen == {"auth": "Bearer tok", "url": "http://core/api/v1/chat-threads/"}


@pytest.mark.parametrize(
    ("status", "error"),
    [(401, Unauthorized), (404, EntityNotFound), (422, UnprocessableEntity)],
)
async def test_core_api_errors_are_reraised_as_domain_errors(status, error):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "from core"})

    with pytest.raises(error, match="from core"):
        await _client(handler).start_thread("tok")


async def test_unexpected_status_and_network_errors_are_provider_unavailable():
    def bad_gateway(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="nope")

    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(ProviderUnavailable):
        await _client(bad_gateway).start_thread("tok")
    with pytest.raises(ProviderUnavailable):
        await _client(unreachable).start_thread("tok")


async def test_conversations_start_a_thread_and_append_turns_as_the_caller():
    seen: list[tuple[str, str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = __import__("json").loads(request.content)
        seen.append((str(request.url), request.headers["Authorization"], body))
        if request.url.path.endswith("/chat-threads/"):
            return httpx.Response(201, json={"id": "t-1"})
        return httpx.Response(201, json={"id": "m-1"})

    client = _client(handler)
    thread_id = await client.start_thread("tok")
    await client.append_turn("tok", thread_id, ChatTurn("user", "hola"))
    await client.append_turn(
        "tok",
        thread_id,
        ChatTurn(
            "assistant",
            "adios",
            sources=(Source("wv:1", "Mitte", "https://x"),),
            model="m",
            input_tokens=1,
            output_tokens=2,
            latency_ms=3,
        ),
    )

    assert thread_id == "t-1"
    assert [url for url, _, _ in seen] == [
        "http://core/api/v1/chat-threads/",
        "http://core/api/v1/chat-threads/t-1/messages/",
        "http://core/api/v1/chat-threads/t-1/messages/",
    ]
    assert {auth for _, auth, _ in seen} == {"Bearer tok"}
    assert seen[1][2]["sources"] is None, "a user turn sends null, not []"
    assert seen[2][2] == {
        "role": "assistant",
        "content": "adios",
        "sources": [{"doc_id": "wv:1", "title": "Mitte", "url": "https://x"}],
        "model": "m",
        "input_tokens": 1,
        "output_tokens": 2,
        "latency_ms": 3,
    }


async def test_a_thread_of_another_user_is_forbidden():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"detail": "not yours"})

    with pytest.raises(Forbidden):
        await _client(handler).append_turn("tok", "t-1", ChatTurn("user", "hola"))


# ─── GET /users/me/access (ADR 0026) ────────────────────────────────────────


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        (
            {"allowed": True, "daily_token_limit": 300000},
            Entitlement(allowed=True, daily_token_limit=300000),
        ),
        (
            {"allowed": True, "daily_token_limit": None},
            Entitlement(allowed=True, daily_token_limit=None),
        ),
        (
            {"allowed": False, "daily_token_limit": 300000},
            Entitlement(allowed=False, daily_token_limit=300000),
        ),
    ],
)
async def test_access_asks_core_api_as_the_caller(body, expected):
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["auth"] = request.headers["Authorization"]
        seen["url"] = str(request.url)
        return httpx.Response(200, json=body)

    assert await _client(handler).access("tok") == expected
    assert seen == {
        "method": "GET",
        "auth": "Bearer tok",
        "url": "http://core/api/v1/users/me/access",
    }


@pytest.mark.parametrize(("status", "error"), [(401, Unauthorized), (403, Forbidden)])
async def test_access_reraises_core_apis_refusals(status, error):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "from core"})

    with pytest.raises(error, match="from core"):
        await _client(handler).access("tok")


async def test_access_is_provider_unavailable_when_core_api_cannot_answer():
    def bad_gateway(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="nope")

    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    def not_json(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>")

    def another_shape(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"allowed": "yes"})

    def a_list(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[True, 300000])

    def a_text_limit(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"allowed": True, "daily_token_limit": "9"})

    handlers = (
        bad_gateway,
        unreachable,
        not_json,
        another_shape,
        a_list,
        a_text_limit,
    )
    for handler in handlers:
        with pytest.raises(ProviderUnavailable):
            await _client(handler).access("tok")


@pytest.mark.parametrize("status", [400, 404, 405, 422])
async def test_access_never_passes_on_another_4xx_of_core_api(status):
    """A planner route answering 404 would read as "route not deployed" in the
    browser: a core_api that cannot answer the access is a 503."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "from core"})

    with pytest.raises(ProviderUnavailable):
        await _client(handler).access("tok")


@pytest.mark.parametrize("limit", [0, -1, -300000])
async def test_access_reads_a_limit_of_zero_or_less_as_no_limit(limit):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"allowed": True, "daily_token_limit": limit})

    assert await _client(handler).access("tok") == Entitlement(
        allowed=True, daily_token_limit=None
    )
