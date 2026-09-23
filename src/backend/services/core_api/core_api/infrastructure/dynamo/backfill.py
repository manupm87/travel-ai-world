"""One-off backfills of the core table's keys, run by `core_api.ops`.

`backfill_trip_index` (TRA-230): trips saved before the admin index existed
(TRA-227, ADR 0024) have no `GSI2PK`/`GSI2SK`, so the sparse GSI2 never lists
them and `GET /api/v1/admin/trips` misses them. It scans the table for trip
items without `GSI2PK` and writes exactly the keys `trip_item` writes today
(`keys.TRIPS_GSI2PK`, `keys.trip_gsi2_sk(created_at, id)`). Idempotent: an
item that already carries the keys is never touched, and a trip saved
concurrently (which stamps itself) is counted as skipped.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from botocore.exceptions import BotoCoreError, ClientError
from travel_common.dynamodb import call
from travel_common.exceptions import ProviderUnavailable

from core_api.infrastructure.dynamo import keys
from core_api.infrastructure.dynamo.table import DynamoTable

logger = logging.getLogger(__name__)


@dataclass
class BackfillResult:
    """One run: trip items found without the keys, stamped, left alone."""

    scanned: int = 0
    updated: int = 0
    skipped: int = 0

    def summary(self, *, dry_run: bool) -> str:
        verb = "would_update" if dry_run else "updated"
        return f"scanned={self.scanned} {verb}={self.updated} skipped={self.skipped}"


def _gsi2_keys(item: dict[str, Any]) -> tuple[str, str]:
    """The GSI2 keys `trip_item` writes for this stored trip (codec decoding)."""
    created_at = datetime.fromisoformat(item["created_at"]["S"])
    trip_id = UUID(item["id"]["S"])
    return keys.TRIPS_GSI2PK, keys.trip_gsi2_sk(created_at, trip_id)


async def backfill_trip_index(
    table: DynamoTable, *, dry_run: bool = False
) -> BackfillResult:
    """Stamp `GSI2PK`/`GSI2SK` on every trip item that lacks them.

    `scanned` counts the trip items found without `GSI2PK`; with `dry_run`
    nothing is written and `updated` is what a real run would stamp.
    `ProviderUnavailable` when DynamoDB refuses a call (credentials, table,
    throttling past the client's retries).
    """
    try:
        return await _backfill(table, dry_run=dry_run)
    except (BotoCoreError, ClientError) as exc:
        logger.error("Trip index backfill failed: %s", exc)
        raise ProviderUnavailable(f"DynamoDB: {exc}") from exc


async def _backfill(table: DynamoTable, *, dry_run: bool) -> BackfillResult:
    result = BackfillResult()
    scan_kwargs: dict[str, Any] = {
        "TableName": table.name,
        "FilterExpression": "begins_with(#sk, :trip) AND attribute_not_exists(#gpk)",
        "ProjectionExpression": "#pk, #sk, #id, created_at",
        "ExpressionAttributeNames": {
            "#pk": keys.PK,
            "#sk": keys.SK,
            "#gpk": keys.GSI2PK,
            "#id": "id",
        },
        "ExpressionAttributeValues": {":trip": {"S": keys.TRIP_PREFIX}},
    }
    while True:
        page = await call(table.client.scan, **scan_kwargs)
        for item in page.get("Items", []):
            result.scanned += 1
            if dry_run or await _stamp(table, item):
                result.updated += 1
            else:
                result.skipped += 1
        last_key = page.get("LastEvaluatedKey")
        if not last_key:
            return result
        scan_kwargs["ExclusiveStartKey"] = last_key


async def _stamp(table: DynamoTable, item: dict[str, Any]) -> bool:
    """Write the GSI2 keys unless a concurrent save did first (`False` then)."""
    gsi2_pk, gsi2_sk = _gsi2_keys(item)
    try:
        await call(
            table.client.update_item,
            TableName=table.name,
            Key={keys.PK: item[keys.PK], keys.SK: item[keys.SK]},
            UpdateExpression="SET #gpk = :gpk, #gsk = :gsk",
            ConditionExpression="attribute_not_exists(#gpk)",
            ExpressionAttributeNames={"#gpk": keys.GSI2PK, "#gsk": keys.GSI2SK},
            ExpressionAttributeValues={
                ":gpk": {"S": gsi2_pk},
                ":gsk": {"S": gsi2_sk},
            },
        )
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            return False
        raise
    return True
