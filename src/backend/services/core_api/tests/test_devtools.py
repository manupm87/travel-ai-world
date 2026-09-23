"""`python -m core_api.devtools token <email>`: a local-mode JWT for an account,
never reachable from the web process (`tests/test_import_boundaries.py`)."""

from typing import Any

import pytest
from core_api import devtools
from core_api.config import CoreSettings, get_settings
from core_api.domain.models import User
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from httpx import AsyncClient
from travel_common.exceptions import DomainError, Forbidden
from travel_common.principal import Role
from travel_common.security import decode_access_token, principal_from_token

from tests.conftest import TEST_TABLE, make_user

settings = get_settings()


async def test_the_token_is_what_the_sign_in_would_issue(
    users: DynamoUserRepository, alice: User
):
    token = await devtools.mint_token(users, alice.email, settings)

    claims = decode_access_token(token, settings)
    assert claims["sub"] == str(alice.id)
    assert claims["email"] == alice.email
    assert claims["role"] == Role.USER.value
    assert "exp" in claims
    principal = principal_from_token(token, settings)
    assert (principal.subject, principal.email, principal.role) == (
        str(alice.id),
        alice.email,
        Role.USER,
    )


async def test_the_api_accepts_the_token(
    client: AsyncClient, users: DynamoUserRepository, alice: User
):
    token = await devtools.mint_token(users, alice.email, settings)

    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["email"] == alice.email


async def test_an_admin_keeps_its_role(users: DynamoUserRepository, admin: User):
    token = await devtools.mint_token(users, admin.email, settings)

    assert principal_from_token(token, settings).role is Role.ADMIN


async def test_admin_flag_promotes_an_existing_account(
    client: AsyncClient, users: DynamoUserRepository, alice: User
):
    token = await devtools.mint_token(users, alice.email, settings, admin=True)

    assert principal_from_token(token, settings).role is Role.ADMIN
    stored = await users.get(alice.id)
    assert stored is not None
    assert stored.role is Role.ADMIN
    trips = await client.get(
        "/api/v1/admin/trips", headers={"Authorization": f"Bearer {token}"}
    )
    assert trips.status_code == 200, trips.text


async def test_admin_flag_creates_an_admin(users: DynamoUserRepository):
    token = await devtools.mint_token(users, "boss@example.com", settings, admin=True)

    created = await users.get_by_email("boss@example.com")
    assert created is not None
    assert created.role is Role.ADMIN
    assert principal_from_token(token, settings).role is Role.ADMIN


async def test_without_the_flag_the_stored_role_stays(
    users: DynamoUserRepository, admin: User, alice: User
):
    """No `--admin` never demotes, and never promotes."""
    admin_token = await devtools.mint_token(users, admin.email, settings)
    alice_token = await devtools.mint_token(users, alice.email, settings)

    assert principal_from_token(admin_token, settings).role is Role.ADMIN
    assert principal_from_token(alice_token, settings).role is Role.USER


async def test_the_subject_is_the_account_id(users: DynamoUserRepository, alice: User):
    """Local tokens name the account by its id: the traces see that subject."""
    await devtools.mint_token(users, alice.email, settings)

    stored = await users.get(alice.id)
    assert stored is not None
    assert stored.subject == str(alice.id)


async def test_an_unknown_account_is_created(
    client: AsyncClient, users: DynamoUserRepository
):
    """A developer (and CI) gets a usable account from the minter alone; the
    real Google sign-in adopts it later, matching on the email."""
    token = await devtools.mint_token(users, "nobody@example.com", settings)

    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "nobody@example.com"

    again = await devtools.mint_token(users, "nobody@example.com", settings)
    assert principal_from_token(again, settings).subject == (
        principal_from_token(token, settings).subject
    ), "minting twice reuses the account"


async def test_an_inactive_account_is_refused(users: DynamoUserRepository):
    user = await make_user("gone@example.com", is_active=False)

    with pytest.raises(Forbidden, match="inactive"):
        await devtools.mint_token(users, user.email, settings)


async def test_cognito_mode_refuses_to_mint(users: DynamoUserRepository, alice: User):
    cognito = CoreSettings(AUTH_MODE="cognito", SECRET_KEY=settings.SECRET_KEY)

    with pytest.raises(Forbidden, match="Cognito"):
        await devtools.mint_token(users, alice.email, cognito)


async def test_the_command_opens_its_own_table(users: DynamoUserRepository):
    """What `just dev-token` runs: settings name the table, nothing else."""
    own = CoreSettings(
        SECRET_KEY=settings.SECRET_KEY, CORE_TABLE=TEST_TABLE, DYNAMODB_ENDPOINT_URL=""
    )

    token = await devtools._mint_with_own_table("cli@example.com", own)

    created = await users.get_by_email("cli@example.com")
    assert created is not None
    assert principal_from_token(token, settings).subject == str(created.id)


def test_cli_prints_the_token_and_exits_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    async def fake_mint(email: str, settings: Any, *, admin: bool = False) -> str:
        return f"jwt-for-{email}{'-admin' if admin else ''}"

    monkeypatch.setattr(devtools, "_mint_with_own_table", fake_mint)

    assert devtools.main(["token", "you@example.com"]) == 0
    out, err = capsys.readouterr()
    assert out == "jwt-for-you@example.com\n"
    assert err == ""

    assert devtools.main(["token", "you@example.com", "--admin"]) == 0
    out, _ = capsys.readouterr()
    assert out == "jwt-for-you@example.com-admin\n"


def test_cli_exits_one_with_a_message_when_minting_is_refused(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    async def fake_mint(email: str, settings: Any, *, admin: bool = False) -> str:
        raise DomainError(f"Account {email} is inactive")

    monkeypatch.setattr(devtools, "_mint_with_own_table", fake_mint)

    assert devtools.main(["token", "nobody@example.com"]) == 1
    out, err = capsys.readouterr()
    assert out == ""
    assert "Account nobody@example.com is inactive" in err


def test_cli_requires_the_email():
    with pytest.raises(SystemExit):
        devtools.build_parser().parse_args(["token"])
