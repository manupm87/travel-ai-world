import pytest
from httpx import AsyncClient


async def _create_and_login(client: AsyncClient, email: str, password: str) -> str:
    """Helper: create a user and return a valid Bearer token."""
    await client.post(
        "/api/v1/users/",
        json={"email": email, "password": password},
    )
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """Valid credentials return a 200 with an access_token."""
    await client.post(
        "/api/v1/users/",
        json={"email": "auth_ok@example.com", "password": "correctpassword"},
    )

    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "auth_ok@example.com", "password": "correctpassword"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    """Wrong password returns 401."""
    await client.post(
        "/api/v1/users/",
        json={"email": "auth_bad@example.com", "password": "correctpassword"},
    )

    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "auth_bad@example.com", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email(client: AsyncClient):
    """Unknown email returns 401 (same response as wrong password to avoid user enumeration)."""
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "nobody@example.com", "password": "whatever"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_with_valid_token(client: AsyncClient):
    """Authenticated GET /users/me returns the current user's profile."""
    token = await _create_and_login(client, "me_test@example.com", "mypassword")

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me_test@example.com"
    assert data["role"] == "user"
    assert "id" in data


@pytest.mark.asyncio
async def test_get_me_without_token(client: AsyncClient):
    """No token returns 401."""
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_users_list_requires_auth(client: AsyncClient):
    """GET /users/ without token returns 401."""
    response = await client.get("/api/v1/users/")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_update_other_user_returns_403(client: AsyncClient):
    """A user cannot update another user's account — expects 403."""
    # Create two users and log in as the second one
    await client.post(
        "/api/v1/users/",
        json={"email": "victim@example.com", "password": "password1"},
    )
    victim_id_resp = await client.post(
        "/api/v1/users/",
        json={"email": "victim2@example.com", "password": "password1"},
    )
    victim_id = victim_id_resp.json()["id"]

    token = await _create_and_login(client, "attacker@example.com", "password2")

    response = await client.put(
        f"/api/v1/users/{victim_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": "victim2_modified@example.com", "is_active": True},
    )
    assert response.status_code == 403
