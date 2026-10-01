"""The access list (ADR 0026): who gets in, and the admin routes that edit it."""

import logging
from collections.abc import Iterator

import pytest
from core_api.api.deps import get_identity_verifier
from core_api.auth.google import ExternalIdentity
from core_api.config import CoreSettings, get_settings
from core_api.domain.models import AccessGrant, User
from core_api.infrastructure.dynamo.repositories import DynamoAccessGrantRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.main import app
from httpx import AsyncClient

from tests.conftest import headers_for, make_user, trip_body

ME_URL = "/api/v1/users/me"
ACCESS_URL = "/api/v1/users/me/access"
TRIPS_URL = "/api/v1/trips/"
THREADS_URL = "/api/v1/chat-threads/"
ADMIN_ACCESS_URL = "/api/v1/admin/access"
DEFAULT_LIMIT = get_settings().DEFAULT_DAILY_TOKEN_LIMIT


def _settings(**changes: object) -> CoreSettings:
    return get_settings().model_copy(update=changes)


@pytest.fixture
def allowlist(client: AsyncClient) -> Iterator[None]:
    """The app in `ACCESS_MODE=allowlist` (the `client` fixture clears it)."""
    app.dependency_overrides[get_settings] = lambda: _settings(ACCESS_MODE="allowlist")
    yield
    app.dependency_overrides.pop(get_settings, None)


@pytest.fixture
def grants(table: DynamoTable) -> DynamoAccessGrantRepository:
    return DynamoAccessGrantRepository(table)


async def _invite(
    grants: DynamoAccessGrantRepository, email: str, limit: int | None = None
) -> None:
    await grants.put(AccessGrant(email=email, daily_token_limit=limit, added_by="t"))


# ── The gate ─────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("allowlist")
async def test_an_uninvited_account_is_refused_everywhere_but_its_own_profile(
    client: AsyncClient, alice: User
):
    headers = headers_for(alice)

    trips = await client.get(TRIPS_URL, headers=headers)
    new_trip = await client.post(TRIPS_URL, json=trip_body(), headers=headers)
    threads = await client.get(THREADS_URL, headers=headers)
    new_thread = await client.post(THREADS_URL, json={}, headers=headers)
    patch = await client.patch(
        f"/api/v1/users/{alice.id}", json={"name": "A"}, headers=headers
    )
    me = await client.get(ME_URL, headers=headers)
    access = await client.get(ACCESS_URL, headers=headers)

    for refused in (trips, new_trip, threads, new_thread, patch):
        assert refused.status_code == 403, refused.text
        assert refused.json()["detail"] == {
            "message": "This account has not been given access yet",
            "error_code": "ACCESS_DENIED",
        }
    assert me.status_code == 200, me.text
    assert me.json()["email"] == alice.email
    assert access.status_code == 200, access.text
    assert access.json() == {"allowed": False, "daily_token_limit": DEFAULT_LIMIT}


class _Verifier:
    """Google's answer for one credential, without Google."""

    async def verify(self, credential: str) -> ExternalIdentity:
        return ExternalIdentity(
            subject="g-1", email="newcomer@example.com", name="New", picture=None
        )


@pytest.mark.usefixtures("allowlist")
async def test_an_uninvited_person_can_still_sign_in_locally_and_is_told_why(
    client: AsyncClient,
):
    """The gate is in the dependency, not in the sign-in: `/auth/google` gives
    an uninvited person a session, so the frontend can explain."""
    app.dependency_overrides[get_identity_verifier] = lambda: _Verifier()

    signed_in = await client.post("/api/v1/auth/google", json={"credential": "x"})

    assert signed_in.status_code == 200, signed_in.text
    assert signed_in.json()["user"]["email"] == "newcomer@example.com"
    headers = {"Authorization": f"Bearer {signed_in.json()['access_token']}"}
    access = await client.get(ACCESS_URL, headers=headers)
    trips = await client.get(TRIPS_URL, headers=headers)
    assert access.status_code == 200, access.text
    assert access.json()["allowed"] is False
    assert trips.status_code == 403
    assert trips.json()["detail"]["error_code"] == "ACCESS_DENIED"


@pytest.mark.usefixtures("allowlist")
async def test_an_invited_account_gets_in_whatever_the_case_of_its_email(
    client: AsyncClient, grants: DynamoAccessGrantRepository
):
    user = await make_user("Carol@Example.com")
    await _invite(grants, " carol@EXAMPLE.com ", limit=1000)
    headers = headers_for(user)

    trips = await client.get(TRIPS_URL, headers=headers)
    threads = await client.get(THREADS_URL, headers=headers)
    access = await client.get(ACCESS_URL, headers=headers)

    assert trips.status_code == 200, trips.text
    assert threads.status_code == 200, threads.text
    assert access.json() == {"allowed": True, "daily_token_limit": 1000}


@pytest.mark.usefixtures("allowlist")
async def test_removing_the_grant_refuses_the_next_call(
    client: AsyncClient, alice: User, admin: User
):
    invited = await client.put(
        f"{ADMIN_ACCESS_URL}/{alice.email}", json={}, headers=headers_for(admin)
    )
    assert invited.status_code == 200, invited.text
    before = await client.get(TRIPS_URL, headers=headers_for(alice))

    removed = await client.delete(
        f"{ADMIN_ACCESS_URL}/{alice.email}", headers=headers_for(admin)
    )
    after = await client.get(TRIPS_URL, headers=headers_for(alice))

    assert before.status_code == 200, before.text
    assert removed.status_code == 204, removed.text
    assert after.status_code == 403
    assert after.json()["detail"]["error_code"] == "ACCESS_DENIED"


@pytest.mark.usefixtures("allowlist")
async def test_an_admin_needs_no_grant(client: AsyncClient, admin: User):
    trips = await client.get(TRIPS_URL, headers=headers_for(admin))
    access = await client.get(ACCESS_URL, headers=headers_for(admin))

    assert trips.status_code == 200, trips.text
    assert access.json() == {"allowed": True, "daily_token_limit": DEFAULT_LIMIT}


@pytest.mark.usefixtures("allowlist")
async def test_the_gate_comes_after_authentication(client: AsyncClient):
    anonymous = await client.get(TRIPS_URL)
    access = await client.get(ACCESS_URL)

    assert anonymous.status_code == 401
    assert access.status_code == 401


async def test_open_mode_lets_everyone_in_and_still_serves_the_limit(
    client: AsyncClient, alice: User, bob: User, grants: DynamoAccessGrantRepository
):
    await _invite(grants, bob.email, limit=0)

    trips = await client.get(TRIPS_URL, headers=headers_for(alice))
    alices = await client.get(ACCESS_URL, headers=headers_for(alice))
    bobs = await client.get(ACCESS_URL, headers=headers_for(bob))

    assert trips.status_code == 200, trips.text
    assert alices.json() == {"allowed": True, "daily_token_limit": DEFAULT_LIMIT}
    assert bobs.json() == {"allowed": True, "daily_token_limit": None}


# ── Admin: the list ──────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("method", "path"),
    [("GET", ""), ("PUT", "/x@example.com"), ("DELETE", "/x@example.com")],
)
async def test_non_admins_cannot_touch_the_list(
    client: AsyncClient, alice: User, method: str, path: str
):
    response = await client.request(
        method,
        f"{ADMIN_ACCESS_URL}{path}",
        json={} if method == "PUT" else None,
        headers=headers_for(alice),
    )

    assert response.status_code == 403
    assert response.json()["detail"]["error_code"] == "FORBIDDEN"


async def test_admin_invites_updates_lists_and_removes(
    client: AsyncClient, admin: User
):
    headers = headers_for(admin)

    created = await client.put(
        f"{ADMIN_ACCESS_URL}/Zoe@Example.com",
        json={"daily_token_limit": 5000, "note": "beta tester"},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    grant = created.json()
    assert grant == {
        "email": "zoe@example.com",
        "daily_token_limit": 5000,
        "note": "beta tester",
        "added_by": str(admin.id),
        "created_at": grant["created_at"],
        "updated_at": grant["updated_at"],
    }

    updated = await client.put(
        f"{ADMIN_ACCESS_URL}/zoe@example.com", json={}, headers=headers
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["daily_token_limit"] is None
    assert updated.json()["note"] is None
    assert updated.json()["created_at"] == grant["created_at"]
    assert updated.json()["updated_at"] >= grant["updated_at"]

    await client.put(f"{ADMIN_ACCESS_URL}/amy@example.com", json={}, headers=headers)
    listed = await client.get(ADMIN_ACCESS_URL, headers=headers)
    assert listed.status_code == 200, listed.text
    assert [g["email"] for g in listed.json()["items"]] == [
        "amy@example.com",
        "zoe@example.com",
    ]
    assert listed.json()["next_cursor"] is None

    removed = await client.delete(
        f"{ADMIN_ACCESS_URL}/ZOE@example.com", headers=headers
    )
    again = await client.delete(f"{ADMIN_ACCESS_URL}/zoe@example.com", headers=headers)
    assert removed.status_code == 204
    assert again.status_code == 404
    assert again.json()["detail"]["error_code"] == "NOT_FOUND"


async def test_the_list_pages_by_cursor_and_leaves_the_accounts_alone(
    client: AsyncClient, admin: User, alice: User
):
    headers = headers_for(admin)
    for email in ("c@example.com", "a@example.com", "b@example.com"):
        await client.put(f"{ADMIN_ACCESS_URL}/{email}", json={}, headers=headers)

    first = await client.get(ADMIN_ACCESS_URL, params={"limit": 2}, headers=headers)
    rest = await client.get(
        ADMIN_ACCESS_URL,
        params={"limit": 2, "cursor": first.json()["next_cursor"]},
        headers=headers,
    )
    users = await client.get("/api/v1/admin/users", headers=headers)
    bad_cursor = await client.get(
        ADMIN_ACCESS_URL, params={"cursor": "nope"}, headers=headers
    )
    too_big = await client.get(ADMIN_ACCESS_URL, params={"limit": 201}, headers=headers)

    assert [g["email"] for g in first.json()["items"]] == [
        "a@example.com",
        "b@example.com",
    ]
    assert [g["email"] for g in rest.json()["items"]] == ["c@example.com"]
    assert rest.json()["next_cursor"] is None
    assert [u["email"] for u in users.json()["items"]] == [admin.email, alice.email]
    assert bad_cursor.status_code == 400
    assert too_big.status_code == 422


@pytest.mark.parametrize(
    ("email", "body"),
    [
        ("not-an-email", {}),
        ("x@example.com", {"daily_token_limit": -1}),
        ("x@example.com", {"daily_token_limit": "many"}),
        ("x@example.com", {"note": "n" * 201}),
    ],
)
async def test_a_bad_email_limit_or_note_is_refused(
    client: AsyncClient, admin: User, email: str, body: dict[str, object]
):
    response = await client.put(
        f"{ADMIN_ACCESS_URL}/{email}", json=body, headers=headers_for(admin)
    )
    listed = await client.get(ADMIN_ACCESS_URL, headers=headers_for(admin))

    assert response.status_code == 422, response.text
    assert listed.json()["items"] == []


async def test_deleting_a_bad_email_is_a_422(client: AsyncClient, admin: User):
    response = await client.delete(
        f"{ADMIN_ACCESS_URL}/not-an-email", headers=headers_for(admin)
    )

    assert response.status_code == 422


async def test_reads_and_writes_of_the_list_are_audited(
    client: AsyncClient,
    admin: User,
    alice: User,
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.INFO, logger="core_api.api.v1.endpoints.admin")
    headers = headers_for(admin)
    route = "/api/v1/admin/access"

    await client.get(ADMIN_ACCESS_URL, headers=headers)
    await client.put(f"{ADMIN_ACCESS_URL}/new@example.com", json={}, headers=headers)
    await client.delete(f"{ADMIN_ACCESS_URL}/new@example.com", headers=headers)
    await client.delete(f"{ADMIN_ACCESS_URL}/x@example.com", headers=headers_for(alice))

    lines = [r.getMessage() for r in caplog.records if "admin_" in r.getMessage()]
    assert lines == [
        f"admin_read subject={admin.id} route={route} target=-",
        f"admin_write subject={admin.id} route={route}/new@example.com "
        "target=new@example.com",
        f"admin_write subject={admin.id} route={route}/new@example.com "
        "target=new@example.com",
    ]


async def test_a_cursor_of_the_accounts_list_is_refused_and_the_reverse(
    client: AsyncClient, admin: User, alice: User
):
    headers = headers_for(admin)
    for email in ("a@example.com", "b@example.com"):
        await client.put(f"{ADMIN_ACCESS_URL}/{email}", json={}, headers=headers)
    users_url = "/api/v1/admin/users"
    grants = await client.get(ADMIN_ACCESS_URL, params={"limit": 1}, headers=headers)
    users = await client.get(users_url, params={"limit": 1}, headers=headers)

    crossed = await client.get(
        ADMIN_ACCESS_URL,
        params={"cursor": users.json()["next_cursor"]},
        headers=headers,
    )
    reverse = await client.get(
        users_url, params={"cursor": grants.json()["next_cursor"]}, headers=headers
    )

    for refused in (crossed, reverse):
        assert refused.status_code == 400, refused.text
        assert refused.json()["detail"]["message"] == "Invalid cursor"
