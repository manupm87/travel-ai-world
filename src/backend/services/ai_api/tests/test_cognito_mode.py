"""AUTH_MODE=cognito: the chat endpoint trusts the pool's RS256 ID tokens, nothing else."""

from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
from ai_api.api.deps import get_llm_provider
from ai_api.config import AISettings, get_settings
from ai_api.main import app
from ai_api.testing import FakeProvider
from httpx import ASGITransport, AsyncClient
from travel_common.principal import Principal
from travel_common.security import create_access_token
from travel_common.testing import CognitoTestIssuer

CHAT_URL = "/api/v1/ai/chat"
pool = CognitoTestIssuer()
COGNITO_SETTINGS = AISettings(**pool.settings_overrides(), SECRET_KEY="")


@pytest.fixture
async def cognito_client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_settings] = lambda: COGNITO_SETTINGS
    app.dependency_overrides[get_llm_provider] = lambda: FakeProvider()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _chat(client: AsyncClient, token: str):
    return await client.post(
        CHAT_URL,
        json={"message": "Hola", "history": []},
        headers={"Authorization": f"Bearer {token}"},
    )


async def test_pool_token_is_accepted(cognito_client: AsyncClient):
    response = await _chat(cognito_client, pool.id_token())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "data: [DONE]" in response.text


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(pool.id_token(expires_in=timedelta(minutes=-1)), id="expired"),
        pytest.param(CognitoTestIssuer(kid=pool.kid).id_token(), id="other-key"),
        pytest.param(pool.id_token(aud="another-client"), id="audience"),
        pytest.param(
            create_access_token(
                Principal(subject="1", email="a@b.c"),
                AISettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min"),
            ),
            id="local-hs256-token",
        ),
    ],
)
async def test_other_tokens_are_401(cognito_client: AsyncClient, token: str):
    response = await _chat(cognito_client, token)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
