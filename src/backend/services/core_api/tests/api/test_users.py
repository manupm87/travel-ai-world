"""Accounts: owners manage their own; administrators see and promote everyone."""

from httpx import AsyncClient

from core_api.models.user import User
from tests.conftest import headers_for

USERS_URL = "/api/v1/users/"


async def test_me_returns_own_profile(client: AsyncClient, alice: User):
    response = await client.get(f"{USERS_URL}me", headers=headers_for(alice))

    assert response.status_code == 200
    assert response.json()["email"] == alice.email
    assert response.json()["role"] == "user"


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
