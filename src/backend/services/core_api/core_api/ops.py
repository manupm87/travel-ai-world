"""Operational commands the deployed function runs on request.

On Lambda there is no container entrypoint to run migrations at start
(ADR 0009): the deploy workflow invokes the function with
`{"command": "migrate"}`, the Lambda Web Adapter delivers that payload as
`POST /events`, and the command runs inside the process. The same commands
are reachable from the container entrypoint (`entrypoint.sh migrate`).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from pathlib import Path

from alembic import command
from alembic.config import Config
from travel_common.exceptions import BadRequest

logger = logging.getLogger(__name__)

# Relative to the working directory: `services/core_api/` locally, `/app` in the image.
ALEMBIC_DIR = Path("alembic")


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


async def migrate() -> None:
    await asyncio.to_thread(upgrade_database)


COMMANDS: dict[str, Callable[[], Awaitable[None]]] = {"migrate": migrate}


async def run_command(name: str) -> None:
    """Run a named command; unknown names are a client error, not a crash."""
    try:
        handler = COMMANDS[name]
    except KeyError:
        raise BadRequest(f"Unknown command: {name}") from None
    logger.info("Running command %s", name)
    await handler()
