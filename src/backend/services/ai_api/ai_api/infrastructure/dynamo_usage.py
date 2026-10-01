"""`UsageStore` over the interactions table in DynamoDB (ADR 0026).

One item per token subject and UTC day, beside the traces (`dynamo_traces`):

| Item  | PK                 | SK                  | GSI1PK              | GSI1SK      |
|-------|--------------------|---------------------|---------------------|-------------|
| usage | `USAGE#<subject>`  | `DAY#<YYYY-MM-DD>`  | `USAGE_DAY#<day>`   | `<subject>` |

with `input_tokens`, `output_tokens`, `embed_tokens`, `turns`, `item = "usage"`
and `expires_at` (the table's TTL). `add` is one `UpdateItem` with `ADD`, so
concurrent turns never lose a count and nothing is read to write. The day is
in the key: there is nothing to reset. The partitions are the counter's own
(`USAGE#`, `USAGE_DAY#`), so no trace listing ever returns one.
"""

from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from botocore.exceptions import ClientError
from travel_common.dynamodb import DynamoDBClient, call
from travel_common.exceptions import ProviderUnavailable

from ai_api.domain.usage import DailyUsage, resets_at


class DynamoUsageStore:
    def __init__(
        self, client: DynamoDBClient, table_name: str, ttl_days: int = 90
    ) -> None:
        self._client = client
        self._table = table_name
        self._ttl = timedelta(days=ttl_days)

    async def add(
        self,
        subject: str,
        day: date,
        *,
        input_tokens: int,
        output_tokens: int,
        embed_tokens: int,
    ) -> None:
        expires_at = int((resets_at(day) + self._ttl).timestamp())
        await self._call(
            self._client.update_item,
            Key=_key(subject, day),
            UpdateExpression=(
                "ADD input_tokens :i, output_tokens :o, embed_tokens :e, turns :one "
                "SET GSI1PK = :gpk, GSI1SK = :gsk, #item = :item, "
                "expires_at = if_not_exists(expires_at, :exp)"
            ),
            ExpressionAttributeNames={"#item": "item"},
            ExpressionAttributeValues={
                ":i": {"N": str(input_tokens)},
                ":o": {"N": str(output_tokens)},
                ":e": {"N": str(embed_tokens)},
                ":one": {"N": "1"},
                ":gpk": {"S": f"USAGE_DAY#{day.isoformat()}"},
                ":gsk": {"S": subject},
                ":item": {"S": "usage"},
                ":exp": {"N": str(expires_at)},
            },
        )

    async def get(self, subject: str, day: date) -> DailyUsage:
        response = await self._call(
            self._client.get_item, Key=_key(subject, day), ConsistentRead=True
        )
        item = response.get("Item")
        if item is None:
            return DailyUsage(subject=subject, day=day.isoformat())
        return _usage(item)

    async def list_day(self, day: date) -> list[DailyUsage]:
        found: list[DailyUsage] = []
        start: dict[str, Any] | None = None
        while True:
            kwargs: dict[str, Any] = {
                "IndexName": "GSI1",
                "KeyConditionExpression": "GSI1PK = :pk",
                "ExpressionAttributeValues": {
                    ":pk": {"S": f"USAGE_DAY#{day.isoformat()}"}
                },
            }
            if start:
                kwargs["ExclusiveStartKey"] = start
            response = await self._call(self._client.query, **kwargs)
            found.extend(_usage(item) for item in response.get("Items", []))
            start = response.get("LastEvaluatedKey")
            if not start:
                return found

    async def _call(self, fn: Callable[..., Any], /, **kwargs: Any) -> Any:
        try:
            return await call(fn, TableName=self._table, **kwargs)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "Unknown")
            raise ProviderUnavailable(f"Usage store unavailable ({code})") from error


class NullUsageStore:
    """Counts nothing: `INTERACTIONS_TABLE` is empty. Every day reads as zeros."""

    async def add(
        self,
        subject: str,
        day: date,
        *,
        input_tokens: int,
        output_tokens: int,
        embed_tokens: int,
    ) -> None:
        return None

    async def get(self, subject: str, day: date) -> DailyUsage:
        return DailyUsage(subject=subject, day=day.isoformat())

    async def list_day(self, day: date) -> list[DailyUsage]:
        return []


def _key(subject: str, day: date) -> dict[str, Any]:
    return {
        "PK": {"S": f"USAGE#{subject}"},
        "SK": {"S": f"DAY#{day.isoformat()}"},
    }


def _usage(item: dict[str, Any]) -> DailyUsage:
    def number(name: str) -> int:
        return int(item.get(name, {}).get("N", "0"))

    return DailyUsage(
        subject=item["PK"]["S"].removeprefix("USAGE#"),
        day=item["SK"]["S"].removeprefix("DAY#"),
        input_tokens=number("input_tokens"),
        output_tokens=number("output_tokens"),
        embed_tokens=number("embed_tokens"),
        turns=number("turns"),
    )
