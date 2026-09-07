"""CoreApiClient against a mocked transport: core_api's answers become domain errors."""

import httpx
import pytest
from ai_api.infrastructure.core_api_client import CoreApiClient
from travel_common.exceptions import (
    EntityNotFound,
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

    assert await _client(handler).create_trip("tok", {"name": "x"}) == {"id": 7}
    assert seen == {"auth": "Bearer tok", "url": "http://core/api/v1/trips/"}


@pytest.mark.parametrize(
    ("status", "error"),
    [(401, Unauthorized), (404, EntityNotFound), (422, UnprocessableEntity)],
)
async def test_core_api_errors_are_reraised_as_domain_errors(status, error):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"detail": "from core"})

    with pytest.raises(error, match="from core"):
        await _client(handler).create_trip("tok", {})


async def test_unexpected_status_and_network_errors_are_provider_unavailable():
    def bad_gateway(request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, text="nope")

    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(ProviderUnavailable):
        await _client(bad_gateway).create_trip("tok", {})
    with pytest.raises(ProviderUnavailable):
        await _client(unreachable).create_trip("tok", {})
