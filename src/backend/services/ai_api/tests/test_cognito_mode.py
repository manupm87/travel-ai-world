"""AUTH_MODE=cognito: the planner's routes trust the pool's RS256 ID tokens, nothing else."""

from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
from ai_api.config import AISettings, get_settings
from ai_api.main import app
from httpx import ASGITransport, AsyncClient
from travel_common.principal import Principal
from travel_common.security import create_access_token
from travel_common.testing import CognitoTestIssuer

CITIES_URL = "/api/v1/ai/planner/cities"
pool = CognitoTestIssuer()
COGNITO_SETTINGS = AISettings(**pool.settings_overrides(), SECRET_KEY="")


@pytest.fixture
async def cognito_client() -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_settings] = lambda: COGNITO_SETTINGS
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _cities(client: AsyncClient, token: str):
    return await client.get(CITIES_URL, headers={"Authorization": f"Bearer {token}"})


async def test_pool_token_is_accepted(cognito_client: AsyncClient):
    response = await _cities(cognito_client, pool.id_token())

    assert response.status_code == 200
    assert response.json(), "the cities of the manifest"


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
    response = await _cities(cognito_client, token)

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
