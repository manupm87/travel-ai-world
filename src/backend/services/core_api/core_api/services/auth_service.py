"""Use case: sign in with an external identity and issue our own token."""

from dataclasses import dataclass

from travel_common.config import CommonSettings
from travel_common.exceptions import Unauthorized
from travel_common.principal import Principal
from travel_common.security import create_access_token

from core_api.auth.google import IdentityVerifier
from core_api.models.user import User
from core_api.services.user_service import UserService


@dataclass(frozen=True, slots=True)
class SignedIn:
    user: User
    access_token: str


class SignIn:
    """Verify the credential, upsert the account, refuse inactive users, issue a JWT."""

    def __init__(
        self, verifier: IdentityVerifier, users: UserService, settings: CommonSettings
    ) -> None:
        self._verifier = verifier
        self._users = users
        self._settings = settings

    async def __call__(self, credential: str) -> SignedIn:
        identity = await self._verifier.verify(credential)
        user = await self._users.upsert_from_identity(identity)
        if not user.is_active:
            raise Unauthorized("Inactive user account")
        principal = Principal(id=user.id, email=user.email, role=user.role)
        return SignedIn(user, create_access_token(principal, self._settings))
