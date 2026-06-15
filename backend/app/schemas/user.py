from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.user import UserRole


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
    role: UserRole


class UserResponse(UserBase):
    id: int
    role: UserRole
    name: str | None = None
    picture: str | None = None
    auth_provider: str = "google"

    model_config = ConfigDict(from_attributes=True)


# ── Google OAuth Schemas ─────────────────────────────────────


class GoogleAuthRequest(BaseModel):
    """Incoming Google ID token from frontend GoogleLogin widget."""

    credential: str


class GoogleUserResponse(BaseModel):
    """Response after successful Google auth."""

    access_token: str
    token_type: str = "bearer"
    user: dict
