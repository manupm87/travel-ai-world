"""One-off operations on the core table: `python -m core_api.ops <command>`.

    just backfill-trip-index --dry-run   # count what would change
    just backfill-trip-index             # stamp it

`backfill-trip-index` (TRA-230) writes `GSI2PK`/`GSI2SK` on every trip saved
before the admin index existed (TRA-227, ADR 0024), so `GET
/api/v1/admin/trips` lists it; the algorithm lives in the adapter
(`infrastructure/dynamo/backfill.py`). Run it once after the TRA-227 apply;
running it again changes nothing.

Settings come from `get_settings()`: with `DYNAMODB_ENDPOINT_URL` it targets
DynamoDB Local; without it, the real `CORE_TABLE` in `AWS_REGION` through the
environment's credentials (`just aws-login`). Nothing in the running service
imports this module.
"""

import argparse
import asyncio
import sys

from travel_common.exceptions import DomainError

from core_api.config import get_settings
from core_api.infrastructure.dynamo.backfill import (
    BackfillResult,
    backfill_trip_index,
    open_core_table,
)


async def _backfill_with_own_table(*, dry_run: bool) -> BackfillResult:
    table = await open_core_table(get_settings())
    return await backfill_trip_index(table, dry_run=dry_run)


# ── CLI: python -m core_api.ops backfill-trip-index [--dry-run] ──────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m core_api.ops",
        description="One-off operations on the core table.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    backfill = commands.add_parser(
        "backfill-trip-index",
        help="write GSI2PK/GSI2SK on trips saved before the admin index (TRA-227)",
    )
    backfill.add_argument(
        "--dry-run",
        action="store_true",
        help="count the trips that would be stamped; write nothing",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    """Exit 0 with the summary on stdout; exit 1 with the reason on stderr."""
    namespace = build_parser().parse_args(argv)
    try:
        result = asyncio.run(_backfill_with_own_table(dry_run=namespace.dry_run))
    except DomainError as exc:
        print(f"error: {exc.message}", file=sys.stderr)
        return 1
    print(result.summary(dry_run=namespace.dry_run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
