"""Developer-only commands: `python -m core_api.devtools token <email>`.

Kept apart from `core_api.ops` on purpose. `ops` is the command surface that
the Lambda's `POST /events` exposes to whoever can invoke the function, and
minting a bearer token for an arbitrary account must never be one of those
commands: nothing in the web process imports this module, and `ops` does not
know it exists. It runs from a shell that already holds `SECRET_KEY` and the
database (a developer's terminal, `docker compose exec core_api`, CI).

    just dev-token you@example.com      # the JWT on stdout, nothing else

The token is exactly what `POST /auth/google` issues in local mode
(`travel_common.security.create_access_token`): HS256 with `SECRET_KEY`,
`sub` = the account's integer id, `email`, `role`, `exp`. The account is
created on the spot when there is none — the real Google sign-in adopts it
later, because both modes match an account by its email. Creating accounts
is why this module is developer-only and why `ops` does not know it exists.
The Playwright suite and the Playwright MCP write the token into
`localStorage` to sign in without Google (`src/frontend/e2e/trips.spec.ts`,
`.claude/commands/check-site.md`).
"""

import argparse
import asyncio
import sys

from travel_common.exceptions import DomainError, Forbidden
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

from core_api.config import CoreSettings, get_settings
from core_api.db.session import SessionFactory, build_engine, build_session_factory
from core_api.models.user import User
from core_api.repositories.user_repository import UserRepository


async def mint_token(
    session_factory: SessionFactory, email: str, settings: CoreSettings
) -> str:
    """A local-mode bearer token for the account `email`, created if it is new.

    `Forbidden` when the account exists but is inactive (the API would answer
    401 to its token) or when the service verifies Cognito tokens, which a
    local one is not.
    """
    if settings.AUTH_MODE != "local":
        raise Forbidden(
            f"AUTH_MODE={settings.AUTH_MODE!r}: core_api verifies tokens issued by "
            "Cognito, so a locally minted one would be rejected"
        )
    async with session_factory() as session:
        users = UserRepository(session)
        user = await users.get_by_email(email)
        if user is None:
            user = await users.create(
                User(
                    email=email,
                    name=email.split("@")[0],
                    is_active=True,
                    role=Role.USER,
                )
            )
        await session.commit()
    if not user.is_active:
        raise Forbidden(f"Account {email} is inactive")
    principal = Principal(subject=str(user.id), email=user.email, role=user.role)
    return create_access_token(principal, settings)


async def _mint_with_own_engine(email: str, settings: CoreSettings) -> str:
    engine = build_engine(settings)
    try:
        return await mint_token(build_session_factory(engine), email, settings)
    finally:
        await engine.dispose()


# ── CLI: python -m core_api.devtools token <email> ──────────────────────────


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
    return parser


def main(argv: list[str] | None = None) -> int:
    """Exit 0 with the token on stdout; exit 1 with the reason on stderr."""
    namespace = build_parser().parse_args(argv)
    try:
        token = asyncio.run(_mint_with_own_engine(namespace.email, get_settings()))
    except DomainError as exc:
        print(f"error: {exc.message}", file=sys.stderr)
        return 1
    print(token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
