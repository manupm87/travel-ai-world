import uuid

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound, Forbidden, Unauthorized
from travel_common.principal import Role

from core_api.auth.google import ExternalIdentity
from core_api.auth.principal import AccountPrincipal
from core_api.domain.models import User
from core_api.domain.ports import UserRepository
from core_api.pagination import Page
from core_api.services import apply_changes


class UserService:
    def __init__(self, users: UserRepository) -> None:
        self.users = users

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self.users.get(user_id)
        if user is None:
            raise EntityNotFound("User", user_id)
        return user

    async def get_by_email(self, email: str) -> User | None:
        return await self.users.get_by_email(email)

    async def get_active(self, user_id: uuid.UUID) -> User:
        """Resolve an authenticated caller. 401 (never 404) so IDs don't leak."""
        user = await self.users.get(user_id)
        if user is None:
            raise Unauthorized("Invalid authentication credentials")
        if not user.is_active:
            raise Unauthorized("Inactive user account")
        return user

    async def get_owned(self, user_id: uuid.UUID, principal: AccountPrincipal) -> User:
        """An account may only be managed by its owner."""
        user = await self.get(user_id)
        if user.id != principal.id:
            raise Forbidden()
        return user

    async def list(self, page: Page = Page()) -> list[User]:
        return await self.users.list(page)

    async def update(self, user: User, data: BaseModel) -> User:
        apply_changes(user, data)
        return await self.users.save(user)

    async def delete(self, user: User) -> None:
        await self.users.delete(user)

    async def upsert_from_identity(
        self, identity: ExternalIdentity, role: Role | None = None
    ) -> User:
        """Find the account by email or create it; refresh the profile either way.

        `role` mirrors the identity provider's answer when it owns roles
        (Cognito groups); left `None`, the account keeps its own. Nothing is
        written when the profile already says the same: Cognito mode runs this
        on every request, and a request must not cost a write.
        """
        user = await self.users.get_by_email(identity.email)
        if user is None:
            return await self.users.add(
                User(
                    email=identity.email,
                    google_id=identity.subject,
                    name=identity.name,
                    picture=identity.picture,
                    auth_provider=identity.provider,
                    is_active=True,
                    role=role or Role.USER,
                )
            )

        profile = {
            "google_id": identity.subject,
            "name": identity.name,
            "picture": identity.picture,
            "auth_provider": identity.provider,
        }
        if role is not None:
            profile["role"] = role
        changed = {
            field: value
            for field, value in profile.items()
            if getattr(user, field) != value
        }
        if not changed:
            return user
        for field, value in changed.items():
            setattr(user, field, value)
        return await self.users.save(user)
