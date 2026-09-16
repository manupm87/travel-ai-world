"""`python -m core_api.devtools token <email>`: a local-mode JWT for an account,
never reachable through `core_api.ops` / `POST /events`."""

import inspect
from typing import Any

import pytest
from core_api import devtools, ops
from core_api.api import events
from core_api.config import CoreSettings, get_settings
from core_api.main import app
from core_api.models.user import User
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from travel_common.exceptions import BadRequest, EntityNotFound, Forbidden
from travel_common.principal import Role
from travel_common.security import decode_access_token, principal_from_token

from tests.conftest import AsyncSessionTest, make_user

settings = get_settings()


async def test_the_token_is_what_the_sign_in_would_issue(alice: User):
    token = await devtools.mint_token(AsyncSessionTest, alice.email, settings)

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


async def test_the_api_accepts_the_token(client: AsyncClient, alice: User):
    token = await devtools.mint_token(AsyncSessionTest, alice.email, settings)

    response = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["email"] == alice.email


async def test_an_admin_keeps_its_role(admin: User):
    token = await devtools.mint_token(AsyncSessionTest, admin.email, settings)

    assert principal_from_token(token, settings).role is Role.ADMIN


async def test_an_unknown_account_is_not_found(db_session: AsyncSession):
    with pytest.raises(EntityNotFound):
        await devtools.mint_token(AsyncSessionTest, "nobody@example.com", settings)


async def test_an_inactive_account_is_refused(db_session: AsyncSession):
    user = await make_user(db_session, "gone@example.com")
    user.is_active = False
    await db_session.commit()

    with pytest.raises(Forbidden, match="inactive"):
        await devtools.mint_token(AsyncSessionTest, user.email, settings)


async def test_cognito_mode_refuses_to_mint(alice: User):
    cognito = CoreSettings(AUTH_MODE="cognito", SECRET_KEY=settings.SECRET_KEY)

    with pytest.raises(Forbidden, match="Cognito"):
        await devtools.mint_token(AsyncSessionTest, alice.email, cognito)


def test_cli_prints_the_token_and_exits_zero(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    async def fake_mint(email: str, settings: Any) -> str:
        return f"jwt-for-{email}"

    monkeypatch.setattr(devtools, "_mint_with_own_engine", fake_mint)

    assert devtools.main(["token", "you@example.com"]) == 0
    out, err = capsys.readouterr()
    assert out == "jwt-for-you@example.com\n"
    assert err == ""


def test_cli_exits_one_with_a_message_when_the_account_is_missing(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    async def fake_mint(email: str, settings: Any) -> str:
        raise EntityNotFound("Account", email)

    monkeypatch.setattr(devtools, "_mint_with_own_engine", fake_mint)

    assert devtools.main(["token", "nobody@example.com"]) == 1
    out, err = capsys.readouterr()
    assert out == ""
    assert "Account not found" in err
    assert "just seed nobody@example.com" in err


def test_cli_requires_the_email():
    with pytest.raises(SystemExit):
        devtools.build_parser().parse_args(["token"])


# ── The boundary: minting is not an operational command ─────────────────────


async def test_token_is_not_an_ops_command():
    assert "token" not in ops.COMMANDS
    with pytest.raises(BadRequest, match="Unknown command"):
        await ops.run_command("token", {"email": "you@example.com"})


async def test_events_cannot_mint_a_token(client: AsyncClient):
    app.dependency_overrides[get_settings] = lambda: CoreSettings(
        AWS_LAMBDA_FUNCTION_NAME="travel-ai-core-api", SECRET_KEY=settings.SECRET_KEY
    )
    try:
        response = await client.post(
            "/events", json={"command": "token", "args": {"email": "you@example.com"}}
        )
    finally:
        app.dependency_overrides.pop(get_settings)

    assert response.status_code == 400
    assert "jwt" not in response.text.lower()


def test_the_service_never_imports_devtools():
    for module in (ops, events):
        assert "devtools" not in inspect.getsource(module)
