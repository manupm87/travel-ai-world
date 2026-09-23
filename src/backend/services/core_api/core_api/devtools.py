"""Developer-only commands: `python -m core_api.devtools token <email> [--admin]`.

Minting a bearer token for an arbitrary account must never be reachable from
the deployed service: nothing in the web process imports this module (a test
walks the package). It runs from a shell that already holds `SECRET_KEY` and
reaches the table (a developer's terminal, `docker compose exec core_api`, CI).

    just dev-token you@example.com      # the JWT on stdout, nothing else

The token is exactly what `POST /auth/google` issues in local mode
(`travel_common.security.create_access_token`): HS256 with `SECRET_KEY`,
`sub` = the account's id (a UUID), `email`, `role`, `exp`. `--admin` makes
the account an administrator first (ADR 0024: in production the Cognito
`admin` group, filled from Terraform, does that). The account is
created on the spot when there is none — the real Google sign-in adopts it
later, because both modes match an account by its email. Creating accounts
is why this module is developer-only.
It honours `DYNAMODB_ENDPOINT_URL` and creates the table there when it is
missing, like the service does. The Playwright suite and the Playwright MCP
write the token into `localStorage` to sign in without Google
(`src/frontend/e2e/trips.spec.ts`, `.claude/commands/check-site.md`).
"""

import argparse
import asyncio
import sys

from travel_common.exceptions import DomainError, Forbidden
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

from core_api.config import CoreSettings, get_settings
from core_api.domain.models import User
from core_api.domain.ports import UserRepository
from core_api.infrastructure.dynamo.repositories import DynamoUserRepository
from core_api.infrastructure.dynamo.table import open_table


async def mint_token(
    users: UserRepository, email: str, settings: CoreSettings, *, admin: bool = False
) -> str:
    """A local-mode bearer token for the account `email`, created if it is new.

    `admin` stores `Role.ADMIN` on the account before minting; without it the
    account keeps the role it has. The account's `subject` is its id, as in
    every local-mode token.

    `Forbidden` when the account exists but is inactive (the API would answer
    401 to its token) or when the service verifies Cognito tokens, which a
    local one is not.
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


# ── CLI: python -m core_api.devtools token <email> [--admin] ─────────────────


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
    return parser


def main(argv: list[str] | None = None) -> int:
    """Exit 0 with the token on stdout; exit 1 with the reason on stderr."""
    namespace = build_parser().parse_args(argv)
    try:
        token = asyncio.run(
            _mint_with_own_table(namespace.email, get_settings(), admin=namespace.admin)
        )
    except DomainError as exc:
        print(f"error: {exc.message}", file=sys.stderr)
        return 1
    print(token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
