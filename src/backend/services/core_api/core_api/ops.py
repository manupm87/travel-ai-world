"""Operational commands, runnable wherever the service runs.

On Lambda there is no container entrypoint (ADR 0009): a direct invocation
with `{"command": "..."}` reaches the process as `POST /events` through the
Lambda Web Adapter, and the command runs inside it. The same commands run
from a shell: `python -m core_api.ops <command>`.

A command takes a dictionary of arguments and may return a result (what
`POST /events` answers with). Unknown names are `BadRequest`, so an event
with a typo answers 400 instead of crashing the function.

`COMMANDS` is the whole surface `POST /events` exposes to whoever can invoke
the function, so a command has to earn its place here. Developer helpers —
anything that mints credentials or writes rows a request could not — live in
their own module, which nothing in the running service imports.

The one command today is `copy-from-postgres` (ADR 0023): production runs it
once after the switch to DynamoDB (TRA-218), and it is deleted with RDS in
TRA-219. It is the only reader of `core_api.legacy_sql`.
"""

import argparse
import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from travel_common.exceptions import BadRequest, DomainError
from travel_common.http.logging import configure_logging

from core_api.config import get_settings
from core_api.domain import models as domain
from core_api.infrastructure.dynamo.repositories import (
    DynamoCopyTarget,
    email_item,
    message_item,
    profile_item,
    thread_item,
    trip_item,
)
from core_api.infrastructure.dynamo.table import DynamoTable, open_table
from core_api.legacy_sql import models as legacy
from core_api.legacy_sql.engine import build_engine

logger = logging.getLogger(__name__)

Args = dict[str, Any]
CommandHandler = Callable[[Args], Awaitable[Any]]

COPIED_VERSION = 1
"""Every copied profile, trip and thread starts at this `version`."""


class CopyIncomplete(DomainError):
    """The copy wrote fewer (or more) items than it read."""

    error_code = "COPY_INCOMPLETE"
    default_message = "copy-from-postgres did not write what it read"


def legacy_user_id(old_id: int) -> uuid.UUID:
    """The account's new id when it has not signed in on DynamoDB yet.

    Deterministic, so a second run overwrites the same items instead of
    duplicating them.
    """
    return uuid.uuid5(uuid.NAMESPACE_URL, f"kyrian-world:user:{old_id}")


# ── Rows to entities ────────────────────────────────────────────────────────


def _columns(row: Any, entity: type, **overrides: Any) -> dict[str, Any]:
    """The row's values for every field `entity` declares, plus overrides."""
    names = entity.__dataclass_fields__  # type: ignore[attr-defined]
    table_columns = {column.key for column in row.__table__.columns}
    values = {name: getattr(row, name) for name in names if name in table_columns}
    return {**values, **overrides}


def _user(row: legacy.User, user_id: uuid.UUID) -> domain.User:
    return domain.User(**_columns(row, domain.User, id=user_id, version=COPIED_VERSION))


def _day(row: legacy.ItineraryDay) -> domain.ItineraryDay:
    return domain.ItineraryDay(
        **_columns(row, domain.ItineraryDay),
        activities=[
            domain.Activity(**_columns(a, domain.Activity)) for a in row.activities
        ],
        meals=[domain.Meal(**_columns(m, domain.Meal)) for m in row.meals],
    )


def _trip(row: legacy.Trip, user_id: uuid.UUID) -> domain.Trip:
    return domain.Trip(
        **_columns(row, domain.Trip, user_id=user_id, version=COPIED_VERSION),
        itinerary_days=[_day(day) for day in row.itinerary_days],
        accommodations=[
            domain.Accommodation(**_columns(a, domain.Accommodation))
            for a in row.accommodations
        ],
        transportations=[
            domain.Transportation(**_columns(t, domain.Transportation))
            for t in row.transportations
        ],
    )


def _thread(row: legacy.ChatThread, user_id: uuid.UUID) -> domain.ChatThread:
    return domain.ChatThread(
        **_columns(row, domain.ChatThread, user_id=user_id, version=COPIED_VERSION)
    )


def _message(row: legacy.ChatMessage) -> domain.ChatMessage:
    return domain.ChatMessage(**_columns(row, domain.ChatMessage))


# ── The copy ────────────────────────────────────────────────────────────────


async def copy_postgres_into(engine: AsyncEngine, table: DynamoTable) -> dict[str, int]:
    """Copy every account, trip, thread and message from PostgreSQL.

    Ids and timestamps are kept; users get UUIDs (the one already registered
    for their email on DynamoDB, else `legacy_user_id`). Writes overwrite, so
    the command can run again.
    """
    async with AsyncSession(engine) as session:
        users = list(await session.scalars(select(legacy.User)))
        trips = list(await session.scalars(select(legacy.Trip)))
        threads = list(await session.scalars(select(legacy.ChatThread)))
        messages = list(
            await session.scalars(
                select(legacy.ChatMessage).order_by(
                    legacy.ChatMessage.thread_id,
                    legacy.ChatMessage.created_at,
                    legacy.ChatMessage.id,
                )
            )
        )
    read = {
        "users": len(users),
        "trips": len(trips),
        "threads": len(threads),
        "messages": len(messages),
    }
    logger.info("Read from PostgreSQL: %s", read)

    target = DynamoCopyTarget(table)
    ids: dict[int, uuid.UUID] = {}
    for row in users:
        ids[row.id] = await target.email_owner(row.email) or legacy_user_id(row.id)

    accounts = [_user(row, ids[row.id]) for row in users]
    written_users = await target.put_all(
        [profile_item(user, COPIED_VERSION) for user in accounts]
    )
    await target.put_all([email_item(user) for user in accounts])
    written = {
        "users": written_users,
        "trips": await target.put_all(
            [trip_item(_trip(row, ids[row.user_id]), COPIED_VERSION) for row in trips]
        ),
        "threads": await target.put_all(
            [
                thread_item(_thread(row, ids[row.user_id]), COPIED_VERSION)
                for row in threads
            ]
        ),
        "messages": await target.put_all([message_item(_message(r)) for r in messages]),
    }
    logger.info("Written to DynamoDB table %s: %s", table.name, written)
    if written != read:
        raise CopyIncomplete(read=read, written=written)
    return written


async def copy_from_postgres(args: Args) -> dict[str, int]:
    settings = get_settings()
    table = await open_table(settings)
    engine = build_engine(settings)
    try:
        return await copy_postgres_into(engine, table)
    finally:
        await engine.dispose()


COMMANDS: dict[str, CommandHandler] = {"copy-from-postgres": copy_from_postgres}


async def run_command(name: str, args: Args | None = None) -> Any:
    """Run a named command; unknown names are a client error, not a crash."""
    try:
        handler = COMMANDS[name]
    except KeyError:
        raise BadRequest(f"Unknown command: {name}") from None
    logger.info("Running command %s", name)
    return await handler(args or {})


# ── CLI: python -m core_api.ops copy-from-postgres ──────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m core_api.ops",
        description="Run an operational command against the configured storage.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "copy-from-postgres",
        help="copy every account, trip and conversation from PostgreSQL to DynamoDB",
    )
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
