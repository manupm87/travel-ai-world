"""`EvalStore` over the interactions table in DynamoDB (ADR 0039).

The admin's evaluation runs, beside the traces and the counters:

| Item | PK              | SK            | GSI1PK      | GSI1SK                     |
|------|-----------------|---------------|-------------|----------------------------|
| run  | `EVAL#<run_id>` | `RUN`         | `EVAL_RUNS` | `<started_at ISO>#<run_id>` |
| item | `EVAL#<run_id>` | `ITEM#<key>`  | —           | —                          |
| lock | `EVAL#LOCK`     | `LOCK`        | —           | —                          |

A run also keeps `eval_set`, `status` and `started_at` as attributes; its body and
each item's are one JSON string (`data`), read back as written. The lock names the run
that holds it and when it started; a conditional put takes it, so two starts at once
cannot both win. Every item carries
`expires_at`, the table's TTL. The partitions are the store's own, so no trace or
counter query returns one.
"""

import asyncio
import json
from collections.abc import Callable, Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from botocore.exceptions import BotoCoreError, ClientError
from travel_common.dynamodb import DynamoDBClient, call
from travel_common.exceptions import ProviderUnavailable

from ai_api.domain.evaluation import (
    EvalItemRecord,
    EvalRunDetail,
    EvalRunRecord,
    EvalSet,
    RunStatus,
)

BATCH_SIZE = 25
"""Most items one `BatchWriteItem` takes."""

RETRIES = 3

BACKOFF_SECONDS = 0.05

RUNS_PARTITION = "EVAL_RUNS"

LOCK_KEY = {"PK": {"S": "EVAL#LOCK"}, "SK": {"S": "LOCK"}}


class _LockTaken(Exception):
    """A conditional write on the lock found it held by another run."""


class DynamoEvalStore:
    def __init__(
        self,
        client: DynamoDBClient,
        table_name: str,
        ttl_days: int = 90,
        *,
        backoff: float = BACKOFF_SECONDS,
    ) -> None:
        self._client = client
        self._table = table_name
        self._ttl = timedelta(days=ttl_days)
        self._backoff = backoff

    async def save_run(self, run: EvalRunRecord) -> None:
        await self._call(
            self._client.put_item,
            Item={
                **_run_key(run.run_id),
                "GSI1PK": {"S": RUNS_PARTITION},
                "GSI1SK": {"S": f"{run.started_at.isoformat()}#{run.run_id}"},
                "item": {"S": "eval_run"},
                "eval_set": {"S": run.eval_set},
                "status": {"S": run.status},
                "started_at": {"S": run.started_at.isoformat()},
                "data": {"S": json.dumps(run.data, ensure_ascii=False)},
                "expires_at": {"N": str(self._expires_at(run.started_at))},
            },
        )

    async def add_items(self, run_id: str, items: Sequence[EvalItemRecord]) -> None:
        expires_at = str(self._expires_at(datetime.now(UTC)))
        requests = [
            {
                "PutRequest": {
                    "Item": {
                        "PK": {"S": f"EVAL#{run_id}"},
                        "SK": {"S": f"ITEM#{item.key}"},
                        "item": {"S": "eval_item"},
                        "data": {"S": json.dumps(item.data, ensure_ascii=False)},
                        "expires_at": {"N": expires_at},
                    }
                }
            }
            for item in items
        ]
        for start in range(0, len(requests), BATCH_SIZE):
            await self._write(requests[start : start + BATCH_SIZE])

    async def list_runs(self, limit: int) -> list[EvalRunRecord]:
        response = await self._call(
            self._client.query,
            IndexName="GSI1",
            KeyConditionExpression="GSI1PK = :pk",
            ExpressionAttributeValues={":pk": {"S": RUNS_PARTITION}},
            ScanIndexForward=False,
            Limit=limit,
        )
        return [_run(item) for item in response.get("Items", [])]

    async def get(self, run_id: str) -> EvalRunDetail | None:
        found: list[dict[str, Any]] = []
        start: dict[str, Any] | None = None
        while True:
            kwargs: dict[str, Any] = {
                "KeyConditionExpression": "PK = :pk",
                "ExpressionAttributeValues": {":pk": {"S": f"EVAL#{run_id}"}},
            }
            if start:
                kwargs["ExclusiveStartKey"] = start
            response = await self._call(self._client.query, **kwargs)
            found.extend(response.get("Items", []))
            start = response.get("LastEvaluatedKey")
            if not start:
                break
        runs = [item for item in found if item["SK"]["S"] == "RUN"]
        if not runs:
            return None
        items = [
            EvalItemRecord(
                key=item["SK"]["S"].removeprefix("ITEM#"),
                data=json.loads(item["data"]["S"]),
            )
            for item in found
            if item["SK"]["S"].startswith("ITEM#")
        ]
        return EvalRunDetail(run=_run(runs[0]), items=items)

    async def claim(self, run_id: str, now: datetime, stale_before: datetime) -> bool:
        try:
            await self._call(
                self._client.put_item,
                Item={
                    **LOCK_KEY,
                    "run_id": {"S": run_id},
                    "started_at": {"S": now.isoformat()},
                    "released": {"BOOL": False},
                    "expires_at": {"N": str(self._expires_at(now))},
                },
                ConditionExpression=(
                    "attribute_not_exists(PK) OR released = :yes OR started_at < :stale"
                ),
                ExpressionAttributeValues={
                    ":yes": {"BOOL": True},
                    ":stale": {"S": stale_before.isoformat()},
                },
            )
        except _LockTaken:
            return False
        return True

    async def release(self, run_id: str) -> None:
        try:
            await self._call(
                self._client.update_item,
                Key=LOCK_KEY,
                UpdateExpression="SET released = :yes",
                ConditionExpression="run_id = :me",
                ExpressionAttributeValues={
                    ":yes": {"BOOL": True},
                    ":me": {"S": run_id},
                },
            )
        except _LockTaken:
            return None  # a later run took it after this one went stale

    def _expires_at(self, start: datetime) -> int:
        return int((start + self._ttl).timestamp())

    async def _write(self, requests: list[dict[str, Any]]) -> None:
        pending: dict[str, list[dict[str, Any]]] = {self._table: requests}
        for attempt in range(RETRIES + 1):
            try:
                response = await call(
                    self._client.batch_write_item, RequestItems=pending
                )
            except (ClientError, BotoCoreError) as error:
                raise _unavailable(error) from error
            pending = response.get("UnprocessedItems") or {}
            if not pending:
                return
            if attempt < RETRIES:
                await asyncio.sleep(self._backoff * 2**attempt)
        raise ProviderUnavailable("Evaluation store unavailable (UnprocessedItems)")

    async def _call(self, fn: Callable[..., Any], /, **kwargs: Any) -> Any:
        try:
            return await call(fn, TableName=self._table, **kwargs)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code == "ConditionalCheckFailedException":
                raise _LockTaken from error
            raise _unavailable(error) from error
        except BotoCoreError as error:
            raise _unavailable(error) from error


class NullEvalStore:
    """Keeps nothing: `INTERACTIONS_TABLE` is empty. Runs still stream."""

    async def save_run(self, run: EvalRunRecord) -> None:
        return None

    async def add_items(self, run_id: str, items: Sequence[EvalItemRecord]) -> None:
        return None

    async def list_runs(self, limit: int) -> list[EvalRunRecord]:
        return []

    async def get(self, run_id: str) -> EvalRunDetail | None:
        return None

    async def claim(self, run_id: str, now: datetime, stale_before: datetime) -> bool:
        return True

    async def release(self, run_id: str) -> None:
        return None


def _run_key(run_id: str) -> dict[str, Any]:
    return {"PK": {"S": f"EVAL#{run_id}"}, "SK": {"S": "RUN"}}


def _run(item: Mapping[str, Any]) -> EvalRunRecord:
    return EvalRunRecord(
        run_id=item["PK"]["S"].removeprefix("EVAL#"),
        eval_set=cast(EvalSet, item["eval_set"]["S"]),
        status=cast(RunStatus, item["status"]["S"]),
        started_at=datetime.fromisoformat(item["started_at"]["S"]),
        data=json.loads(item["data"]["S"]),
    )


def _unavailable(error: ClientError | BotoCoreError) -> ProviderUnavailable:
    code = (
        error.response.get("Error", {}).get("Code", "Unknown")
        if isinstance(error, ClientError)
        else type(error).__name__
    )
    return ProviderUnavailable(f"Evaluation store unavailable ({code})")
