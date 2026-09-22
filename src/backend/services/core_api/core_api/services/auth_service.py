"""Use cases behind the bearer token.

`Authenticate` turns a verified token into the account calling, in both
auth modes (ADR 0009). `SignIn` is the local-mode issuer: it exchanges a
Google credential for one of our own tokens.
"""

from dataclasses import dataclass
from uuid import UUID

from travel_common.exceptions import Unauthorized
from travel_common.principal import Claims, Principal
from travel_common.security import create_access_token, verify_token

from core_api.auth.google import ExternalIdentity, IdentityVerifier
from core_api.auth.principal import AccountPrincipal
from core_api.config import CoreSettings
from core_api.domain.models import User
from core_api.services.user_service import UserService

COGNITO_PROVIDER = "cognito"


class Authenticate:
    """Verify the token, then confirm the account exists and is active.

    The account store is the source of truth for status: a revoked user is cut
    off immediately, not when the token expires. Who owns the role depends
    on the mode: the database in local mode, the Cognito `admin` group in
    Cognito mode (mirrored into the profile so it reads the same).
    """

    def __init__(self, users: UserService, settings: CoreSettings) -> None:
        self._users = users
        self._settings = settings

    async def __call__(self, token: str) -> AccountPrincipal:
        claims = verify_token(token, self._settings)
        if self._settings.AUTH_MODE == "cognito":
            user = await self._upsert_cognito_user(claims)
        else:
            user = await self._users.get_active(_account_id(claims))
        return AccountPrincipal(
            subject=claims.subject, email=user.email, role=user.role, id=user.id
        )

    async def _upsert_cognito_user(self, claims: Claims) -> User:
        """The pool already authenticated the person; the profile follows the
        claims, and is written only when they changed it."""
        identity = ExternalIdentity(
            subject=claims.subject,
            email=claims.email,
            name=claims.name,
            picture=claims.picture,
            provider=COGNITO_PROVIDER,
        )
        user = await self._users.upsert_from_identity(identity, role=claims.role)
        if not user.is_active:
            raise Unauthorized("Inactive user account")
        return user


def _account_id(claims: Claims) -> UUID:
    """Local tokens name the account by its id, a UUID."""
    try:
        return UUID(claims.subject)
    except ValueError as exc:
        raise Unauthorized("Invalid authentication credentials") from exc


@dataclass(frozen=True, slots=True)
class SignedIn:
    user: User
    access_token: str


class SignIn:
    """Verify the credential, upsert the account, refuse inactive users, issue a JWT."""

    def __init__(
        self, verifier: IdentityVerifier, users: UserService, settings: CoreSettings
    ) -> None:
        self._verifier = verifier
        self._users = users
        self._settings = settings

    async def __call__(self, credential: str) -> SignedIn:
        identity = await self._verifier.verify(credential)
        user = await self._users.upsert_from_identity(identity)
        if not user.is_active:
            raise Unauthorized("Inactive user account")
        principal = Principal(subject=str(user.id), email=user.email, role=user.role)
        return SignedIn(user, create_access_token(principal, self._settings))
