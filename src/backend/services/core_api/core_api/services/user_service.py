from pydantic import BaseModel
from travel_common.exceptions import Forbidden, Unauthorized
from travel_common.principal import Role

from core_api.auth.google import ExternalIdentity
from core_api.auth.principal import AccountPrincipal
from core_api.models.user import User
from core_api.repositories.user_repository import UserRepository
from core_api.schemas.user import UserRoleUpdate, UserUpdate
from core_api.services.base import BaseService


class UserService(BaseService[User, BaseModel, UserUpdate | UserRoleUpdate]):
    repository: UserRepository

    async def get_by_email(self, email: str) -> User | None:
        return await self.repository.get_by_email(email)

    async def get_active(self, user_id: int) -> User:
        """Resolve an authenticated caller. 401 (never 404) so IDs don't leak."""
        user = await self.repository.get_by_id(user_id)
        if user is None:
            raise Unauthorized("Invalid authentication credentials")
        if not user.is_active:
            raise Unauthorized("Inactive user account")
        return user

    async def get_owned(self, user_id: int, principal: AccountPrincipal) -> User:
        """An account may only be managed by its owner."""
        user = await self.get(user_id)
        if user.id != principal.id:
            raise Forbidden()
        return user

    async def upsert_from_identity(
        self, identity: ExternalIdentity, role: Role | None = None
    ) -> User:
        """Find the account by email or create it; refresh the profile either way.

        `role` mirrors the identity provider's answer when it owns roles
        (Cognito groups); left `None`, the database keeps its own.
        """
        user = await self.repository.get_by_email(identity.email)
        if user:
            user.google_id = identity.subject
            user.name = identity.name
            user.picture = identity.picture
            user.auth_provider = identity.provider
            if role is not None:
                user.role = role
            return await self.repository.update(user)

        return await self.repository.create(
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
