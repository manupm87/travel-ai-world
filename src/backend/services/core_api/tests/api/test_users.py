"""Accounts: owners manage their own; administrators see and promote everyone."""

from core_api.domain.models import User
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from httpx import AsyncClient

from tests.conftest import headers_for

USERS_URL = "/api/v1/users/"


async def test_me_returns_own_profile(client: AsyncClient, alice: User):
    response = await client.get(f"{USERS_URL}me", headers=headers_for(alice))

    assert response.status_code == 200
    assert response.json()["email"] == alice.email
    assert response.json()["role"] == "user"
    assert "subject" in response.json(), "nullable, always present"


async def test_profiles_are_not_public(client: AsyncClient, alice: User, bob: User):
    response = await client.get(f"{USERS_URL}{bob.id}", headers=headers_for(alice))

    assert response.status_code == 403


async def test_admin_lists_and_reads_users(
    client: AsyncClient, admin: User, alice: User
):
    listed = await client.get(USERS_URL, headers=headers_for(admin))
    one = await client.get(f"{USERS_URL}{alice.id}", headers=headers_for(admin))

    assert listed.status_code == 200
    assert {u["email"] for u in listed.json()} == {admin.email, alice.email}
    assert one.json()["email"] == alice.email


async def test_listing_is_admin_only(client: AsyncClient, alice: User):
    assert (await client.get(USERS_URL, headers=headers_for(alice))).status_code == 403


async def test_owner_updates_own_account_only(
    client: AsyncClient, alice: User, bob: User
):
    mine = await client.patch(
        f"{USERS_URL}{alice.id}", json={"name": "Alice L."}, headers=headers_for(alice)
    )
    theirs = await client.patch(
        f"{USERS_URL}{bob.id}", json={"name": "Hacked"}, headers=headers_for(alice)
    )

    assert mine.status_code == 200
    assert mine.json()["name"] == "Alice L."
    assert theirs.status_code == 403


async def test_role_change_is_admin_only(client: AsyncClient, admin: User, alice: User):
    """Local mode only: in Cognito mode the route does not exist
    (`test_cognito_mode.py`)."""
    denied = await client.patch(
        f"{USERS_URL}{alice.id}/role",
        json={"role": "admin"},
        headers=headers_for(alice),
    )
    promoted = await client.patch(
        f"{USERS_URL}{alice.id}/role",
        json={"role": "admin"},
        headers=headers_for(admin),
    )

    assert denied.status_code == 403
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"


async def test_owner_deletes_own_account(client: AsyncClient, alice: User):
    headers = headers_for(alice)

    assert (
        await client.delete(f"{USERS_URL}{alice.id}", headers=headers)
    ).status_code == 204
    # The token is still valid but the account is gone: 401, not 404.
    assert (await client.get(f"{USERS_URL}me", headers=headers)).status_code == 401


async def test_ids_are_uuids(client: AsyncClient, admin: User, alice: User):
    me = await client.get(f"{USERS_URL}me", headers=headers_for(alice))
    not_a_uuid = await client.get(f"{USERS_URL}42", headers=headers_for(admin))

    assert me.json()["id"] == str(alice.id)
    assert not_a_uuid.status_code == 422


async def test_the_email_and_the_active_flag_are_not_editable(
    client: AsyncClient, alice: User, users: DynamoUserRepository
):
    """A sign-in finds its account (and so its trips) by email; switching an
    account off has no way back. A PATCH changes neither."""
    response = await client.patch(
        f"{USERS_URL}{alice.id}",
        json={"email": "alice.l@example.com", "is_active": False, "name": "Al"},
        headers=headers_for(alice),
    )

    assert response.status_code == 200, response.text
    assert response.json()["email"] == alice.email
    assert response.json()["is_active"] is True
    stored = await users.get(alice.id)
    assert stored is not None
    assert (stored.email, stored.is_active, stored.name) == (alice.email, True, "Al")
