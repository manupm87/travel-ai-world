"""CoreApiClient against a mocked transport: `GET /users/me/access` as the
caller (ADR 0026), and what becomes of core_api's refusals and failures."""

import httpx
import pytest
from ai_api.domain.usage import Entitlement
from ai_api.infrastructure.core_api_client import CoreApiClient
from travel_common.exceptions import Forbidden, ProviderUnavailable, Unauthorized


def _client(handler) -> CoreApiClient:
    transport = httpx.MockTransport(handler)
    return CoreApiClient(
        "http://core",
        client_factory=lambda **kw: httpx.AsyncClient(transport=transport, **kw),
    )


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
