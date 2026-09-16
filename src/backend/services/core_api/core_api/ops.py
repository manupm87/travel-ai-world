"""Operational commands, runnable wherever the service runs.

On Lambda there is no container entrypoint to run migrations at start
(ADR 0009): the deploy workflow invokes the function with
`{"command": "migrate"}`, the Lambda Web Adapter delivers that payload as
`POST /events`, and the command runs inside the process. The same commands
are reachable from the container entrypoint (`entrypoint.sh migrate`,
`entrypoint.sh seed <email>`) and from a shell (`python -m core_api.ops ...`,
what `just migrate`-style recipes call).

A command takes a dictionary of arguments: `migrate` ignores them, `seed`
needs `email`. Unknown names and missing arguments are `BadRequest`, so an
event with a typo answers 400 instead of crashing the function.
"""

import argparse
import asyncio
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from alembic import command
from alembic.config import Config
from travel_common.exceptions import BadRequest
from travel_common.http.logging import configure_logging

from core_api.config import get_settings
from core_api.db.session import build_engine, build_session_factory
from core_api.seed import SeedReport, seed_demo_trips

logger = logging.getLogger(__name__)

# Relative to the working directory: `services/core_api/` locally, `/app` in the image.
ALEMBIC_DIR = Path("alembic")

Args = dict[str, Any]
CommandHandler = Callable[[Args], Awaitable[Any]]


def upgrade_database(scripts: Path = ALEMBIC_DIR) -> None:
    """`alembic upgrade head`, blocking. `env.py` opens its own event loop, so
    call this from a worker thread when a loop is already running.

    No `alembic.ini`: reading it would make `env.py` reconfigure the logging
    of the running web process. The database URL comes from settings anyway.
    """
    logger.info("Applying migrations from %s", scripts.resolve())
    config = Config()
    config.set_main_option("script_location", str(scripts))
    command.upgrade(config, "head")


async def migrate(args: Args) -> None:
    await asyncio.to_thread(upgrade_database)


async def seed(args: Args) -> SeedReport:
    """Load the demo trips for `args["email"]` (`core_api.seed`).

    Opens its own engine: the command runs from a shell as often as from the
    web process, and one short-lived engine per run keeps both paths equal.
    """
    email = args.get("email")
    if not isinstance(email, str) or not email.strip():
        raise BadRequest("seed needs args.email: the account to load the trips for")
    engine = build_engine(get_settings())
    try:
        return await seed_demo_trips(build_session_factory(engine), email.strip())
    finally:
        await engine.dispose()


COMMANDS: dict[str, CommandHandler] = {"migrate": migrate, "seed": seed}


async def run_command(name: str, args: Args | None = None) -> Any:
    """Run a named command; unknown names are a client error, not a crash."""
    try:
        handler = COMMANDS[name]
    except KeyError:
        raise BadRequest(f"Unknown command: {name}") from None
    logger.info("Running command %s", name)
    return await handler(args or {})


# ── CLI: python -m core_api.ops migrate | seed <email> ──────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m core_api.ops",
        description="Run an operational command against the configured database.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "migrate", help="apply Alembic migrations (alembic upgrade head)"
    )
    seed_parser = commands.add_parser(
        "seed", help="load the four demo trips for an account, creating it if needed"
    )
    seed_parser.add_argument("email", help="owner of the demo trips")
    return parser


def main(argv: list[str] | None = None) -> None:
    namespace = build_parser().parse_args(argv)
    args = {k: v for k, v in vars(namespace).items() if k != "command"}
    configure_logging(get_settings().LOG_LEVEL)
    result = asyncio.run(run_command(namespace.command, args))
    if result is not None:
        # The CLI's one line for the terminal; everything else is logged.
        print(result)


if __name__ == "__main__":
    main()
