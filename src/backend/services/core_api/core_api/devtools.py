"""Developer-only commands: `token <email> [--admin] [--browser]` and `grant <email> [--limit N]`.

They mint tokens and create accounts, so nothing in the web process imports this
module (a test checks it); run as `python -m core_api.devtools`.
"""

import argparse
import asyncio
import json
import sys

from travel_common.exceptions import DomainError, Forbidden
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token, principal_from_token

from core_api.config import CoreSettings, get_settings
from core_api.domain.models import AccessGrant, User
from core_api.domain.ports import AccessGrantRepository, UserRepository
from core_api.infrastructure.dynamo.repositories import (
    DynamoAccessGrantRepository,
    DynamoUserRepository,
)
from core_api.infrastructure.dynamo.table import open_table


async def mint_token(
    users: UserRepository, email: str, settings: CoreSettings, *, admin: bool = False
) -> str:
    """A local-mode token for `email`, exactly what `POST /auth/google` issues.

    Creates the account if it is new (a later Google sign-in adopts it by email);
    `admin` stores `Role.ADMIN` first, otherwise the role stays.

    Raises:
        Forbidden: the account is inactive, or the service runs in Cognito mode.
    """
    if settings.AUTH_MODE != "local":
        raise Forbidden(
            f"AUTH_MODE={settings.AUTH_MODE!r}: core_api verifies tokens issued by "
            "Cognito, so a locally minted one would be rejected"
        )
    user = await users.get_by_email(email)
    if user is None:
        user = User(email=email, name=email.split("@")[0], is_active=True)
        user.role = Role.ADMIN if admin else Role.USER
        user.subject = str(user.id)
        user = await users.add(user)
    if not user.is_active:
        raise Forbidden(f"Account {email} is inactive")
    wanted_role = Role.ADMIN if admin else user.role
    if user.role != wanted_role or user.subject != str(user.id):
        user.role = wanted_role
        user.subject = str(user.id)
        user = await users.save(user)
    principal = Principal(subject=str(user.id), email=user.email, role=user.role)
    return create_access_token(principal, settings)


async def _mint_with_own_table(
    email: str, settings: CoreSettings, *, admin: bool = False
) -> str:
    table = await open_table(settings)
    return await mint_token(DynamoUserRepository(table), email, settings, admin=admin)


def browser_snippet(token: str, settings: CoreSettings) -> str:
    """A line for the browser's DevTools console that stores the session and reloads.

    The keys are the frontend's (`src/frontend/src/services/session.ts`).
    """
    principal = principal_from_token(token, settings)
    profile = {
        "id": principal.subject,
        "email": principal.email,
        "name": principal.email.split("@")[0],
    }
    return (
        f"localStorage.setItem('travel_ai_token', {json.dumps(token)}); "
        f"localStorage.setItem('travel_ai_user', {json.dumps(json.dumps(profile))}); "
        "location.reload()"
    )


GRANTED_BY = "devtools"
"""`added_by` of a grant written from a shell: no administrator was involved."""


async def grant_access(
    grants: AccessGrantRepository, email: str, limit: int | None = None
) -> AccessGrant:
    """Put `email` on the access list, as `PUT /admin/access/{email}` would."""
    return await grants.put(
        AccessGrant(email=email, daily_token_limit=limit, added_by=GRANTED_BY)
    )


async def _grant_with_own_table(
    email: str, settings: CoreSettings, *, limit: int | None = None
) -> AccessGrant:
    table = await open_table(settings)
    return await grant_access(DynamoAccessGrantRepository(table), email, limit)


def _limit(value: str) -> int:
    limit = int(value)
    if limit < 0:
        raise argparse.ArgumentTypeError("the limit cannot be negative")
    return limit


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m core_api.devtools",
        description="Developer-only helpers; never reachable from the running service.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    token = commands.add_parser(
        "token",
        help="print a local-mode JWT for an account, creating it when it is new",
    )
    token.add_argument("email", help="the account to sign in as")
    token.add_argument(
        "--admin",
        action="store_true",
        help="make the account an administrator before minting",
    )
    token.add_argument(
        "--browser",
        action="store_true",
        help="print a DevTools console line that signs the browser in, not the bare JWT",
    )
    grant = commands.add_parser(
        "grant", help="put an email on the access list of the local table"
    )
    grant.add_argument("email", help="the email to invite")
    grant.add_argument(
        "--limit",
        type=_limit,
        default=None,
        help="daily token limit (0 = unlimited; default: the service default)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Exit 0 with the result on stdout; exit 1 with the reason on stderr."""
    namespace = build_parser().parse_args(argv)
    try:
        if namespace.command == "grant":
            granted = asyncio.run(
                _grant_with_own_table(
                    namespace.email, get_settings(), limit=namespace.limit
                )
            )
            limit = granted.daily_token_limit
            shown = "default" if limit is None else limit or "unlimited"
            print(f"granted {granted.email} (daily token limit: {shown})")
            return 0
        token = asyncio.run(
            _mint_with_own_table(namespace.email, get_settings(), admin=namespace.admin)
        )
    except DomainError as exc:
        print(f"error: {exc.message}", file=sys.stderr)
        return 1
    print(browser_snippet(token, get_settings()) if namespace.browser else token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
