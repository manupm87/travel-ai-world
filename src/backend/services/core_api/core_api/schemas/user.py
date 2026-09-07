from pydantic import BaseModel, ConfigDict, EmailStr
from travel_common.principal import Role


class UserBase(BaseModel):
    email: EmailStr
    is_active: bool = True


class UserUpdate(BaseModel):
    """All fields are optional — supports partial PUT/PATCH updates."""

    email: EmailStr | None = None
    is_active: bool | None = None
    name: str | None = None
    picture: str | None = None


class UserRoleUpdate(BaseModel):
    role: Role


class UserResponse(UserBase):
    id: int
    role: Role
    name: str | None = None
    picture: str | None = None
    auth_provider: str = "google"

    model_config = ConfigDict(from_attributes=True)


# ── Google OAuth Schemas ─────────────────────────────────────


class GoogleAuthRequest(BaseModel):
    """Incoming Google ID token from the frontend GoogleLogin widget."""

    credential: str


class AuthUser(BaseModel):
    """The profile the frontend keeps next to the access token."""

    id: int
    email: str
    name: str | None = None
    picture: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GoogleAuthResponse(BaseModel):
    """Response after a successful Google sign-in."""

    access_token: str
    token_type: str = "bearer"  # noqa: S105 — a scheme name, not a secret
    user: AuthUser
