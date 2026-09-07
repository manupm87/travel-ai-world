"""GoogleTokenInfoVerifier against a mocked transport: no network."""

import httpx
import pytest

from core_api.auth.google import TOKENINFO_URL, GoogleTokenInfoVerifier
from travel_common.exceptions import Unauthorized

CLAIMS = {
    "aud": "our-client-id",
    "sub": "123",
    "email": "ada@example.com",
    "name": "Ada",
    "picture": "http://p/a.png",
}


def _verifier(handler) -> GoogleTokenInfoVerifier:
    transport = httpx.MockTransport(handler)
    return GoogleTokenInfoVerifier(
        "our-client-id",
        client_factory=lambda **kw: httpx.AsyncClient(transport=transport, **kw),
    )


async def test_valid_token_becomes_an_identity():
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        return httpx.Response(200, json=CLAIMS)

    identity = await _verifier(handler).verify("tok")

    assert seen["url"] == f"{TOKENINFO_URL}?id_token=tok"
    assert identity.subject == "123"
    assert identity.email == "ada@example.com"
    assert identity.picture == "http://p/a.png"


@pytest.mark.parametrize(
    "response",
    [
        pytest.param(
            httpx.Response(400, json={"error": "invalid_token"}), id="rejected"
        ),
        pytest.param(
            httpx.Response(200, json={**CLAIMS, "aud": "other"}), id="audience"
        ),
        pytest.param(
            httpx.Response(200, json={"aud": "our-client-id"}), id="no-claims"
        ),
    ],
)
async def test_bad_answers_are_unauthorized(response: httpx.Response):
    with pytest.raises(Unauthorized):
        await _verifier(lambda request: response).verify("tok")


async def test_network_failure_is_unauthorized_not_500():
    def unreachable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    with pytest.raises(Unauthorized):
        await _verifier(unreachable).verify("tok")
