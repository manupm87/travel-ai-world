"""AUTH_MODE=cognito: the pool's ID tokens are the credential; no token issuing here.

A stand-in pool (`CognitoTestIssuer`) signs tokens with a generated RSA key;
the app is built with that pool's settings so the JWKS check is real.
"""

from collections.abc import AsyncGenerator

import pytest
from core_api.api.v1.api_router import build_api_router
from core_api.config import CoreSettings, get_settings
from core_api.db.session import get_db, unit_of_work
from core_api.main import lifespan
from core_api.models.user import User
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from travel_common.http.app_factory import create_app
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token
from travel_common.testing import CognitoTestIssuer

from tests.conftest import AsyncSessionTest, make_user, trip_body

pool = CognitoTestIssuer()
COGNITO_SETTINGS = CoreSettings(**pool.settings_overrides(), SECRET_KEY="")


@pytest.fixture
async def cognito_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """A core_api built in Cognito mode, against the test database."""
    app = create_app(
        COGNITO_SETTINGS, [build_api_router(COGNITO_SETTINGS)], lifespan=lifespan
    )

    async def _get_test_db():
        async with AsyncSessionTest() as session, unit_of_work(session) as scoped:
            yield scoped

    app.dependency_overrides[get_db] = _get_test_db
    app.dependency_overrides[get_settings] = lambda: COGNITO_SETTINGS
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_first_request_creates_the_account_from_the_claims(
    cognito_client: AsyncClient, db_session: AsyncSession
):
    token = pool.id_token(sub="sub-ada", email="ada@example.com", name="Ada")

    me = await cognito_client.get("/api/v1/users/me", headers=bearer(token))

    assert me.status_code == 200, me.text
    assert me.json()["email"] == "ada@example.com"
    assert me.json()["name"] == "Ada"
    assert me.json()["role"] == "user"
    assert me.json()["auth_provider"] == "cognito"
    row = (await db_session.execute(select(User))).scalar_one()
    assert row.google_id == "sub-ada"


async def test_returning_user_keeps_id_and_admin_group_is_mirrored(
    cognito_client: AsyncClient, db_session: AsyncSession
):
    existing = await make_user(db_session, "ada@example.com")
    token = pool.id_token(email="ada@example.com", groups=("admin",))

    me = await cognito_client.get("/api/v1/users/me", headers=bearer(token))
    everyone = await cognito_client.get("/api/v1/users/", headers=bearer(token))

    assert me.json()["id"] == existing.id
    assert me.json()["role"] == "admin"
    assert everyone.status_code == 200  # admin-only endpoint


async def test_deactivated_account_is_refused_even_with_a_valid_token(
    cognito_client: AsyncClient, db_session: AsyncSession
):
    user = await make_user(db_session, "ada@example.com")
    user.is_active = False
    await db_session.commit()

    me = await cognito_client.get(
        "/api/v1/users/me", headers=bearer(pool.id_token(email="ada@example.com"))
    )

    assert me.status_code == 401
    assert me.json()["detail"]["message"] == "Inactive user account"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(CognitoTestIssuer(kid=pool.kid).id_token(), id="other-key"),
        pytest.param(pool.id_token(aud="someone-else"), id="audience"),
        pytest.param(pool.id_token(token_use="access"), id="access-token"),
        pytest.param(
            create_access_token(
                Principal(subject="1", email="a@b.c", role=Role.ADMIN),
                CoreSettings(SECRET_KEY="unit-test-secret-key-with-32-bytes-min"),
            ),
            id="local-hs256-token",
        ),
    ],
)
async def test_tokens_not_issued_by_the_pool_are_401(
    cognito_client: AsyncClient, db_session: AsyncSession, token: str
):
    response = await cognito_client.get("/api/v1/users/me", headers=bearer(token))

    assert response.status_code == 401
    assert (await db_session.execute(select(User))).first() is None


async def test_trips_are_scoped_to_the_account_behind_the_token(
    cognito_client: AsyncClient,
):
    ada = bearer(pool.id_token(sub="sub-ada", email="ada@example.com"))
    bob = bearer(pool.id_token(sub="sub-bob", email="bob@example.com"))
    created = await cognito_client.post(
        "/api/v1/trips/",
        json=trip_body(title="Budapest in autumn"),
        headers=ada,
    )
    assert created.status_code == 201, created.text
    trip_id = created.json()["id"]

    assert (
        await cognito_client.get(f"/api/v1/trips/{trip_id}", headers=ada)
    ).status_code == 200
    assert (
        await cognito_client.get(f"/api/v1/trips/{trip_id}", headers=bob)
    ).status_code == 403


async def test_no_sign_in_endpoint_in_cognito_mode(cognito_client: AsyncClient):
    response = await cognito_client.post(
        "/api/v1/auth/google", json={"credential": "x"}
    )

    assert response.status_code == 404
