"""Request and response bodies of accounts and of the local Google sign-in."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from travel_common.principal import Role


class UserBase(BaseModel):
    email: EmailStr
    is_active: bool = True


class UserUpdate(BaseModel):
    """A partial update (PATCH) of the caller's profile; every field is optional.

    The email (how a sign-in finds the account and its trips) and `is_active` are not
    editable.
    """

    name: str | None = Field(None, max_length=255)
    # a URL; long enough for any avatar link, short of bloating the profile item
    picture: str | None = Field(None, max_length=2048)


class UserRoleUpdate(BaseModel):
    role: Role


class UserResponse(UserBase):
    id: UUID
    role: Role
    name: str | None = None
    picture: str | None = None
    auth_provider: str = "google"
    # the token `sub` the account signs in with; the AI traces name users by it
    # (ADR 0024); null until the account's next request
    subject: str | None

    model_config = ConfigDict(from_attributes=True)


class GoogleAuthRequest(BaseModel):
    """Incoming Google ID token from the frontend GoogleLogin widget."""

    credential: str


class AuthUser(BaseModel):
    """The profile the frontend keeps next to the access token."""

    id: UUID
    email: str
    name: str | None = None
    picture: str | None = None

    model_config = ConfigDict(from_attributes=True)


class GoogleAuthResponse(BaseModel):
    """Response after a successful Google sign-in."""

    access_token: str
    token_type: str = "bearer"  # noqa: S105 — a scheme name, not a secret
    user: AuthUser
