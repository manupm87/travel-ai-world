"""Who may use the app, and how many tokens a day (ADR 0026).

The access list is read at request time: it has to be editable without a
deploy and before the person's first sign-in. Administrators never need a
grant (their role comes from the identity provider, ADR 0024).
"""

from dataclasses import dataclass

from travel_common.exceptions import AccessDenied, EntityNotFound
from travel_common.principal import Principal

from core_api.config import CoreSettings
from core_api.domain.models import AccessGrant, normalize_email
from core_api.domain.ports import AccessGrantRepository


@dataclass(frozen=True, slots=True)
class Access:
    """What the caller may do: `daily_token_limit` None means unlimited."""

    allowed: bool
    daily_token_limit: int | None


class AccessService:
    def __init__(self, grants: AccessGrantRepository, settings: CoreSettings) -> None:
        self.grants = grants
        self.settings = settings

    async def resolve(self, principal: Principal) -> Access:
        """The caller's access. The grant is read in every mode: its limit
        applies in `open` mode and to administrators too."""
        grant = await self.grants.get(principal.email)
        allowed = self._needs_no_grant(principal) or grant is not None
        limit = (
            grant.daily_token_limit
            if grant is not None and grant.daily_token_limit is not None
            else self.settings.DEFAULT_DAILY_TOKEN_LIMIT
        )
        return Access(allowed=allowed, daily_token_limit=limit or None)

    async def ensure_allowed(self, principal: Principal) -> None:
        """`AccessDenied` (403) unless the caller may use the app. Nothing is
        read when the mode or the role already answers."""
        if self._needs_no_grant(principal):
            return
        if await self.grants.get(principal.email) is None:
            raise AccessDenied()

    def _needs_no_grant(self, principal: Principal) -> bool:
        return self.settings.ACCESS_MODE == "open" or principal.is_admin

    async def list_page(
        self, cursor: str | None, limit: int
    ) -> tuple[list[AccessGrant], str | None]:
        return await self.grants.list_page(cursor, limit)

    async def upsert(
        self,
        email: str,
        daily_token_limit: int | None,
        note: str | None,
        admin: Principal,
    ) -> AccessGrant:
        """Invite `email` or change its grant; the first admin stays `added_by`."""
        grant = AccessGrant(
            email=email,
            daily_token_limit=daily_token_limit,
            note=(note or "").strip() or None,
            added_by=admin.subject,
        )
        return await self.grants.put(grant)

    async def remove(self, email: str) -> None:
        if not await self.grants.delete(email):
            raise EntityNotFound("Access grant", normalize_email(email))
