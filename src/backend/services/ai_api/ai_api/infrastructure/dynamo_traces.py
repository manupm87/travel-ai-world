"""`TraceLog` over the interactions table in DynamoDB (ADR 0023, ADR 0024).

One trace is several items, written with `BatchWriteItem` in chunks of 25:

| Item    | PK                   | SK                        |
|---------|----------------------|---------------------------|
| summary | `DAY#<YYYY-MM-DD>`   | `<ts µs ISO>#<turn_id>`   |
| context | `TURN#<turn_id>`     | `CONTEXT`                 |
| events  | `TURN#<turn_id>`     | `EVENTS`                  |
| step    | `TURN#<turn_id>`     | `SPAN#<seq:04d>`          |

The summary also carries GSI1 (`SUBJECT#<subject>` / ts: one user's turns)
and, when the turn has a session, GSI2 (`SESSION#<session_id>` / ts: one
conversation's turns). Every item has `expires_at` (epoch seconds), the
table's TTL attribute. `None` is written as NULL so every key is present.

On AWS the table is Terraform's (`infra/aws/traces.tf`); `spec()` creates it
only against a local endpoint (Compose, `just dynamodb-local`, tests).
"""

import asyncio
import dataclasses
import logging
from collections.abc import Mapping, Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from boto3.dynamodb.types import TypeSerializer
from travel_common.dynamodb import DynamoDBClient, TableSpec, call

from ai_api.domain.tracing import TurnTrace

logger = logging.getLogger(__name__)

BATCH_SIZE = 25
"""Most items one `BatchWriteItem` takes."""

RETRIES = 3
"""Retries of the items DynamoDB left unprocessed, with backoff."""

BACKOFF_SECONDS = 0.05

_serializer = TypeSerializer()


class TraceWriteFailed(RuntimeError):
    """DynamoDB kept leaving items unprocessed."""


def spec(table_name: str) -> TableSpec:
    return TableSpec(
        name=table_name,
        gsis=(("GSI1", "GSI1PK", "GSI1SK"), ("GSI2", "GSI2PK", "GSI2SK")),
        ttl_attribute="expires_at",
    )


class DynamoTraceLog:
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

    async def record(self, trace: TurnTrace) -> None:
        items = trace_items(trace, self._ttl)
        for start in range(0, len(items), BATCH_SIZE):
            await self._write(
                [
                    {"PutRequest": {"Item": item}}
                    for item in items[start : start + BATCH_SIZE]
                ]
            )

    async def _write(self, requests: list[dict[str, Any]]) -> None:
        pending: dict[str, list[dict[str, Any]]] = {self._table: requests}
        for attempt in range(RETRIES + 1):
            response = await call(self._client.batch_write_item, RequestItems=pending)
            pending = response.get("UnprocessedItems") or {}
            if not pending:
                return
            if attempt < RETRIES:
                await asyncio.sleep(self._backoff * 2**attempt)
        left = sum(len(v) for v in pending.values())
        raise TraceWriteFailed(f"{left} trace items left unprocessed")


class NullTraceLog:
    """Records nothing: `INTERACTIONS_TABLE` is empty."""

    async def record(self, trace: TurnTrace) -> None:
        return None


# ─── Items ──────────────────────────────────────────────────────────────────


def summary_sk(trace: TurnTrace) -> str:
    return f"{_iso(trace.ts)}#{trace.turn_id}"


def trace_items(trace: TurnTrace, ttl: timedelta) -> list[dict[str, Any]]:
    """Every item of one trace, as DynamoDB attribute maps."""
    expires_at = int((trace.ts + ttl).timestamp())
    day = trace.ts.date().isoformat()
    ts = _iso(trace.ts)
    turn_pk = f"TURN#{trace.turn_id}"

    summary: dict[str, Any] = {
        "PK": f"DAY#{day}",
        "SK": summary_sk(trace),
        "GSI1PK": f"SUBJECT#{trace.subject}",
        "GSI1SK": ts,
        "item": "summary",
    }
    if trace.session_id:
        summary["GSI2PK"] = f"SESSION#{trace.session_id}"
        summary["GSI2SK"] = ts
    skip = {"spans", "timeline", "context", "ts"}
    for f in dataclasses.fields(trace):
        if f.name not in skip:
            summary[f.name] = getattr(trace, f.name)
    summary["ts"] = ts
    summary["expires_at"] = expires_at

    context: dict[str, Any] = {
        "PK": turn_pk,
        "SK": "CONTEXT",
        "item": "context",
        **dataclasses.asdict(trace.context),
        "day": day,
        "summary_sk": summary_sk(trace),
        "expires_at": expires_at,
    }
    events: dict[str, Any] = {
        "PK": turn_pk,
        "SK": "EVENTS",
        "item": "events",
        "timeline": trace.timeline,
        "expires_at": expires_at,
    }
    spans = [
        {
            "PK": turn_pk,
            "SK": f"SPAN#{span.seq:04d}",
            "item": "span",
            **dataclasses.asdict(span),
            "expires_at": expires_at,
        }
        for span in trace.spans
    ]
    return [_attributes(item) for item in (summary, context, events, *spans)]


def _iso(ts: datetime) -> str:
    return ts.isoformat(timespec="microseconds")


def _attributes(item: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _serializer.serialize(_plain(value)) for key, value in item.items()}


def _plain(value: Any) -> Any:
    """Values `TypeSerializer` accepts; `None` stays (NULL), unlike
    `travel_common.dynamodb.to_item`, so a payload key is never missing."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return _plain(dataclasses.asdict(value))
    if isinstance(value, Mapping):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        return [_plain(item) for item in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return Decimal(str(value)) if value == value else None  # NaN → NULL
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value
