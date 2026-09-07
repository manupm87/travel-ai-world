"""POST /auth/google: the use case behind it, with the identity provider faked."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from core_api.api.deps import get_identity_verifier
from core_api.auth.google import ExternalIdentity
from core_api.config import get_settings
from core_api.main import app
from core_api.models.user import User
from tests.conftest import make_user
from travel_common.exceptions import Unauthorized
from travel_common.security import principal_from_token

AUTH_URL = "/api/v1/auth/google"


class FakeVerifier:
    def __init__(self, identity: ExternalIdentity | None) -> None:
        self.identity = identity
        self.credentials: list[str] = []

    async def verify(self, credential: str) -> ExternalIdentity:
        self.credentials.append(credential)
        if self.identity is None:
            raise Unauthorized("Invalid Google token")
        return self.identity


@pytest.fixture
def identity() -> ExternalIdentity:
    return ExternalIdentity(
        subject="g-123", email="ada@example.com", name="Ada", picture="http://p/a.png"
    )


@pytest.fixture
def verifier(identity: ExternalIdentity) -> FakeVerifier:
    fake = FakeVerifier(identity)
    app.dependency_overrides[get_identity_verifier] = lambda: fake
    return fake


async def test_first_sign_in_creates_the_account_and_issues_our_token(
    client: AsyncClient, verifier: FakeVerifier, identity: ExternalIdentity
):
    response = await client.post(AUTH_URL, json={"credential": "google-jwt"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert verifier.credentials == ["google-jwt"]
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == identity.email
    assert body["user"]["name"] == "Ada"

    principal = principal_from_token(body["access_token"], get_settings())
    assert principal.email == identity.email
    assert principal.id == body["user"]["id"]

    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200


async def test_returning_user_keeps_id_and_refreshes_profile(
    client: AsyncClient,
    db_session: AsyncSession,
    verifier: FakeVerifier,
    identity: ExternalIdentity,
):
    existing = await make_user(db_session, identity.email)

    response = await client.post(AUTH_URL, json={"credential": "x"})

    assert response.status_code == 200
    assert response.json()["user"]["id"] == existing.id
    assert response.json()["user"]["picture"] == identity.picture


async def test_inactive_account_cannot_sign_in(
    client: AsyncClient,
    db_session: AsyncSession,
    verifier: FakeVerifier,
    identity: ExternalIdentity,
):
    user = await make_user(db_session, identity.email)
    user.is_active = False
    await db_session.commit()

    response = await client.post(AUTH_URL, json={"credential": "x"})

    assert response.status_code == 401
    assert response.json()["detail"]["message"] == "Inactive user account"


async def test_rejected_credential_is_401(client: AsyncClient):
    app.dependency_overrides[get_identity_verifier] = lambda: FakeVerifier(None)

    response = await client.post(AUTH_URL, json={"credential": "forged"})

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_no_user_is_created_when_the_credential_is_rejected(
    client: AsyncClient, db_session: AsyncSession
):
    app.dependency_overrides[get_identity_verifier] = lambda: FakeVerifier(None)

    await client.post(AUTH_URL, json={"credential": "forged"})

    assert (await db_session.get(User, 1)) is None
