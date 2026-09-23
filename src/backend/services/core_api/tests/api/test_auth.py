"""POST /auth/google: the use case behind it, with the identity provider faked."""

import pytest
from core_api.api.deps import get_identity_verifier
from core_api.auth.google import ExternalIdentity
from core_api.config import get_settings
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from core_api.main import app
from core_api.pagination import Page
from httpx import AsyncClient
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token, principal_from_token

from tests.conftest import make_user

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
    assert principal.subject == str(body["user"]["id"])

    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    # Our token names the account by its id, so that is its subject (ADR 0024).
    assert me.json()["subject"] == str(body["user"]["id"])


async def test_returning_user_keeps_id_and_refreshes_profile(
    client: AsyncClient,
    verifier: FakeVerifier,
    identity: ExternalIdentity,
):
    existing = await make_user(identity.email)

    response = await client.post(AUTH_URL, json={"credential": "x"})

    assert response.status_code == 200
    assert response.json()["user"]["id"] == str(existing.id)
    assert response.json()["user"]["picture"] == identity.picture


async def test_inactive_account_cannot_sign_in(
    client: AsyncClient,
    verifier: FakeVerifier,
    identity: ExternalIdentity,
):
    await make_user(identity.email, is_active=False)

    response = await client.post(AUTH_URL, json={"credential": "x"})

    assert response.status_code == 401
    assert response.json()["detail"]["message"] == "Inactive user account"


async def test_rejected_credential_is_401(client: AsyncClient):
    app.dependency_overrides[get_identity_verifier] = lambda: FakeVerifier(None)

    response = await client.post(AUTH_URL, json={"credential": "forged"})

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_no_user_is_created_when_the_credential_is_rejected(
    client: AsyncClient, users: DynamoUserRepository
):
    app.dependency_overrides[get_identity_verifier] = lambda: FakeVerifier(None)

    await client.post(AUTH_URL, json={"credential": "forged"})

    assert await users.list(Page()) == []


async def test_a_local_token_must_name_a_uuid(client: AsyncClient):
    """Integer ids are gone (ADR 0023): a token minted before the switch is 401."""
    principal = Principal(subject="42", email="old@example.com", role=Role.USER)
    token = create_access_token(principal, get_settings())

    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 401
