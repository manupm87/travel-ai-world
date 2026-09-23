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

The reads (TRA-221) serve the admin API: a day's turns (`DAY#` partition), a
user's (GSI1), a session's (GSI2), one turn whole (`TURN#` partition, then its
summary) and every summary of a range of days. `summary_from_item` and
`detail_from_items` are `trace_items`' inverse. A page ends with an opaque
cursor: base64url of DynamoDB's `LastEvaluatedKey` as JSON.
"""

import asyncio
import base64
import binascii
import dataclasses
import json
import logging
from collections.abc import AsyncIterator, Callable, Iterable, Mapping, Sequence
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError
from travel_common.dynamodb import DynamoDBClient, TableSpec, call
from travel_common.exceptions import BadRequest, ProviderUnavailable

from ai_api.domain.tracing import (
    EventMark,
    RetrievedDoc,
    Span,
    TurnContext,
    TurnDetail,
    TurnFilters,
    TurnPage,
    TurnSummary,
    TurnTrace,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 25
"""Most items one `BatchWriteItem` takes."""

RETRIES = 3
"""Retries of the items DynamoDB left unprocessed, with backoff."""

BACKOFF_SECONDS = 0.05

MAX_ROUND_TRIPS = 10
"""Queries one filtered page may take before it returns short."""

_serializer = TypeSerializer()
_deserializer = TypeDeserializer()

_INDEX_KEYS: dict[str | None, tuple[str, ...]] = {
    None: ("PK", "SK"),
    "GSI1": ("PK", "SK", "GSI1PK", "GSI1SK"),
    "GSI2": ("PK", "SK", "GSI2PK", "GSI2SK"),
}
"""The attributes of a `LastEvaluatedKey` on the table and on each index."""


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

    # ─── Reads ──────────────────────────────────────────────────────────────

    async def list_day(
        self, day: date, filters: TurnFilters, cursor: str | None, limit: int
    ) -> TurnPage:
        query = _key_query(None, "PK", f"DAY#{day.isoformat()}", newest=True)
        return await self._page(query, None, filters, cursor, limit)

    async def list_subject(
        self, subject: str, filters: TurnFilters, cursor: str | None, limit: int
    ) -> TurnPage:
        query = _key_query("GSI1", "GSI1PK", f"SUBJECT#{subject}", newest=True)
        return await self._page(query, "GSI1", filters, cursor, limit)

    async def list_session(
        self, session_id: str, cursor: str | None, limit: int
    ) -> TurnPage:
        query = _key_query("GSI2", "GSI2PK", f"SESSION#{session_id}", newest=False)
        return await self._page(query, "GSI2", TurnFilters(), cursor, limit)

    async def get(self, turn_id: str) -> TurnDetail | None:
        items = [
            item
            async for item in self._query_all(
                _key_query(None, "PK", f"TURN#{turn_id}", newest=False)
            )
        ]
        context = next((i for i in items if i["SK"].get("S") == "CONTEXT"), None)
        if context is None:
            return None
        keys = _plain_item(context)
        response = await self._call(
            self._client.get_item,
            Key={"PK": {"S": f"DAY#{keys['day']}"}, "SK": {"S": keys["summary_sk"]}},
        )
        summary = response.get("Item")
        if summary is None:
            return None
        return detail_from_items([summary, *items])

    async def iter_range(self, start: date, end: date) -> AsyncIterator[TurnSummary]:
        day = start
        while day <= end:
            query = _key_query(None, "PK", f"DAY#{day.isoformat()}", newest=True)
            async for item in self._query_all(query):
                yield summary_from_item(item)
            day += timedelta(days=1)

    async def _query_all(self, query: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """Every item a query matches, page after page."""
        start: dict[str, Any] | None = None
        while True:
            kwargs = {**query, "ExclusiveStartKey": start} if start else query
            response = await self._call(self._client.query, **kwargs)
            for item in response.get("Items", []):
                yield item
            start = response.get("LastEvaluatedKey")
            if not start:
                return

    async def _page(
        self,
        query: dict[str, Any],
        index: str | None,
        filters: TurnFilters,
        cursor: str | None,
        limit: int,
    ) -> TurnPage:
        """Up to `limit` matching summaries. A filter may leave a query short,
        so query again from where it stopped, `MAX_ROUND_TRIPS` at most."""
        start = decode_cursor(cursor, _INDEX_KEYS[index])
        base = _with_filters(query, filters)
        found: list[TurnSummary] = []
        for _ in range(MAX_ROUND_TRIPS):
            kwargs = {**base, "Limit": limit - len(found)}
            if start:
                kwargs["ExclusiveStartKey"] = start
            response = await self._call(self._client.query, **kwargs)
            found.extend(summary_from_item(i) for i in response.get("Items", []))
            start = response.get("LastEvaluatedKey")
            if not start or len(found) >= limit:
                break
        return TurnPage(items=found, next_cursor=encode_cursor(start))

    async def _call(self, fn: Callable[..., Any], /, **kwargs: Any) -> Any:
        """A read on the table; a DynamoDB failure is `ProviderUnavailable`."""
        try:
            return await call(fn, TableName=self._table, **kwargs)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "Unknown")
            raise ProviderUnavailable(f"Trace store unavailable ({code})") from error


class NullTraceLog:
    """Records nothing: `INTERACTIONS_TABLE` is empty. Reads find nothing."""

    async def record(self, trace: TurnTrace) -> None:
        return None

    async def list_day(
        self, day: date, filters: TurnFilters, cursor: str | None, limit: int
    ) -> TurnPage:
        return TurnPage(items=[], next_cursor=None)

    async def list_subject(
        self, subject: str, filters: TurnFilters, cursor: str | None, limit: int
    ) -> TurnPage:
        return TurnPage(items=[], next_cursor=None)

    async def list_session(
        self, session_id: str, cursor: str | None, limit: int
    ) -> TurnPage:
        return TurnPage(items=[], next_cursor=None)

    async def get(self, turn_id: str) -> TurnDetail | None:
        return None

    async def iter_range(self, start: date, end: date) -> AsyncIterator[TurnSummary]:
        return
        yield  # an async generator that yields nothing


# ─── Queries and cursors ────────────────────────────────────────────────────


def _key_query(
    index: str | None, key: str, value: str, *, newest: bool
) -> dict[str, Any]:
    query: dict[str, Any] = {
        "KeyConditionExpression": "#pk = :pk",
        "ExpressionAttributeNames": {"#pk": key},
        "ExpressionAttributeValues": {":pk": {"S": value}},
        "ScanIndexForward": not newest,
    }
    if index:
        query["IndexName"] = index
    return query


def _with_filters(query: dict[str, Any], filters: TurnFilters) -> dict[str, Any]:
    """`query` with a `FilterExpression` for the filters in force
    (`#f0 = :f0 AND ...`; `kind` and `status` are reserved words, so every
    attribute goes through a name placeholder)."""
    active = sorted(filters.active().items())
    if not active:
        return query
    names = dict(query["ExpressionAttributeNames"])
    values = dict(query["ExpressionAttributeValues"])
    clauses: list[str] = []
    for n, (name, value) in enumerate(active):
        names[f"#f{n}"] = name
        values[f":f{n}"] = {"S": value}
        clauses.append(f"#f{n} = :f{n}")
    return {
        **query,
        "FilterExpression": " AND ".join(clauses),
        "ExpressionAttributeNames": names,
        "ExpressionAttributeValues": values,
    }


def encode_cursor(last_key: Mapping[str, Any] | None) -> str | None:
    if not last_key:
        return None
    raw = json.dumps(last_key, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str | None, keys: Iterable[str]) -> dict[str, Any] | None:
    """The `ExclusiveStartKey` a cursor stands for; `BadRequest` when it is
    not one this query could have produced."""
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        start = json.loads(base64.urlsafe_b64decode(padded.encode()))
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise BadRequest("Invalid cursor") from exc
    if (
        not isinstance(start, dict)
        or set(start) != set(keys)
        or not all(
            isinstance(value, dict)
            and set(value) == {"S"}
            and isinstance(value["S"], str)
            for value in start.values()
        )
    ):
        raise BadRequest("Invalid cursor")
    return start


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


# ─── Items back into traces ─────────────────────────────────────────────────


def summary_from_item(item: Mapping[str, Any]) -> TurnSummary:
    """The summary item as a `TurnSummary` (the inverse of its half of
    `trace_items`); the day and the key come from `PK` and `SK`."""
    plain = _plain_item(item)
    names = {f.name for f in dataclasses.fields(TurnSummary)} - {"day", "sk", "ts"}
    values: dict[str, Any] = {name: plain.get(name) for name in names}
    values["sources"] = [RetrievedDoc(**doc) for doc in plain.get("sources") or []]
    values["events"] = plain.get("events") or {}
    values["ops"] = plain.get("ops") or {}
    return TurnSummary(
        **values,
        ts=datetime.fromisoformat(plain["ts"]),
        day=plain["PK"].removeprefix("DAY#"),
        sk=plain["SK"],
    )


def detail_from_items(items: Iterable[Mapping[str, Any]]) -> TurnDetail:
    """A whole turn from its summary item and its `TURN#` items."""
    summary: TurnSummary | None = None
    context: TurnContext | None = None
    spans: list[Span] = []
    timeline: list[EventMark] = []
    for item in items:
        plain = _plain_item(item)
        match plain.get("item"):
            case "summary":
                summary = summary_from_item(item)
            case "context":
                context = TurnContext(**_fields_of(TurnContext, plain))
            case "events":
                timeline = [EventMark(**mark) for mark in plain.get("timeline") or []]
            case "span":
                values = _fields_of(Span, plain)
                values["results"] = [
                    RetrievedDoc(**doc) for doc in values.get("results") or []
                ]
                values["payload"] = values.get("payload") or {}
                spans.append(Span(**values))
    if summary is None or context is None:
        raise ValueError("a turn needs its summary and its context items")
    spans.sort(key=lambda span: span.seq)
    return TurnDetail(summary=summary, context=context, spans=spans, timeline=timeline)


def _fields_of(cls: Any, plain: Mapping[str, Any]) -> dict[str, Any]:
    return {f.name: plain[f.name] for f in dataclasses.fields(cls) if f.name in plain}


def _plain_item(item: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: _native(_deserializer.deserialize(value)) for key, value in item.items()
    }


def _native(value: Any) -> Any:
    """Deserialized values back to Python's: a `Decimal` written from an
    `int` comes back `int`, any other `float`; sets become lists."""
    if isinstance(value, dict):
        return {key: _native(item) for key, item in value.items()}
    if isinstance(value, list | set | frozenset):
        return [_native(item) for item in value]
    if isinstance(value, Decimal):
        exponent = value.as_tuple().exponent
        if isinstance(exponent, int) and exponent >= 0:
            return int(value)
        return float(value)
    return value
