import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post(
        "/api/v1/users/",
        json={"email": "test@example.com", "password": "securepassword"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["role"] == "user"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_user_duplicate(client: AsyncClient):
    # First creation
    await client.post(
        "/api/v1/users/",
        json={"email": "duplicate@example.com", "password": "password123"},
    )
    # Second creation with same email
    response = await client.post(
        "/api/v1/users/",
        json={"email": "duplicate@example.com", "password": "password123"},
    )
    assert response.status_code == 409
    assert (
        response.json()["detail"]["message"]
        == "User or email already exists in the system."
    )


@pytest.mark.asyncio
async def test_admin_update_user_role(client: AsyncClient, db_session):
    """Admin can update user roles via PATCH."""
    # 1. Create a regular user
    await client.post(
        "/api/v1/users/", json={"email": "std@example.com", "password": "password"}
    )

    # 2. Create an admin user manually in DB (since we don't have an admin creation endpoint yet)
    from app.models.user import User, UserRole
    from app.core.security import get_password_hash

    admin = User(
        email="admin@example.com",
        hashed_password=get_password_hash("adminpass"),
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()

    # 3. Login as admin
    login_resp = await client.post(
        "/api/v1/auth/login",
        data={"username": "admin@example.com", "password": "adminpass"},
    )
    token = login_resp.json()["access_token"]

    # 4. Get the target user ID
    await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}
    )  # This is the admin, we need the other one
    # Let's just query the DB for the other user's ID
    import sqlalchemy as sa

    res = await db_session.execute(
        sa.select(User).where(User.email == "std@example.com")
    )
    target_user = res.scalar_one()

    # 5. Update role to ADMIN
    patch_resp = await client.patch(
        f"/api/v1/users/{target_user.id}/role",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "admin"},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["role"] == "admin"
