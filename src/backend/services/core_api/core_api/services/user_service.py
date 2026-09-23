import builtins
import uuid

from pydantic import BaseModel
from travel_common.exceptions import Conflict, EntityNotFound, Forbidden, Unauthorized
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

    async def list_page(
        self, cursor: str | None, limit: int
    ) -> tuple[builtins.list[User], str | None]:
        """Every account by email, a cursor page at a time (admins, ADR 0024)."""
        return await self.users.list_page(cursor, limit)

    async def update(self, user: User, data: BaseModel) -> User:
        apply_changes(user, data)
        return await self.users.save(user)

    async def delete(self, user: User) -> None:
        await self.users.delete(user)

    async def upsert_from_identity(
        self,
        identity: ExternalIdentity,
        role: Role | None = None,
        *,
        subject_is_account_id: bool = False,
    ) -> User:
        """Find the account by email or create it; refresh the profile either way.

        `role` mirrors the identity provider's answer when it owns roles
        (Cognito groups); left `None`, the account keeps its own. Nothing is
        written when the profile already says the same: Cognito mode runs this
        on every request, and a request must not cost a write.

        `User.subject` is the `sub` of the tokens the account will present
        (ADR 0024): the identity's own subject with Cognito, the account id
        when this service issues the token itself (`subject_is_account_id`,
        local mode).
        """
        user = await self.users.get_by_email(identity.email)
        if user is None:
            created = User(
                email=identity.email,
                google_id=identity.subject,
                name=identity.name,
                picture=identity.picture,
                auth_provider=identity.provider,
                is_active=True,
                role=role or Role.USER,
            )
            created.subject = _token_subject(created, identity, subject_is_account_id)
            try:
                return await self.users.add(created)
            except Conflict:
                # A first sign-in fires several requests at once; one of them
                # created the account between our read and our write.
                user = await self.users.get_by_email(identity.email)
                if user is None:
                    raise
        try:
            return await self._refresh(user, identity, role, subject_is_account_id)
        except Conflict:
            # Another request refreshed the same profile first: start from it.
            fresh = await self.users.get_by_email(identity.email)
            if fresh is None:
                raise
            return await self._refresh(fresh, identity, role, subject_is_account_id)

    async def _refresh(
        self,
        user: User,
        identity: ExternalIdentity,
        role: Role | None,
        subject_is_account_id: bool,
    ) -> User:
        """Bring the stored profile in line with the identity; write only on a change."""
        profile = {
            "subject": _token_subject(user, identity, subject_is_account_id),
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


def _token_subject(
    user: User, identity: ExternalIdentity, subject_is_account_id: bool
) -> str:
    return str(user.id) if subject_is_account_id else identity.subject
