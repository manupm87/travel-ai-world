"""The domain's repository ports over the core table (ADR 0023).

Versioned writes are conditional, so a lost race is a `Conflict`, never a silent
overwrite. With no cascades, deletes walk what an item owns and remove it in batches.
Any other DynamoDB failure is `ProviderUnavailable` (503).
"""

import asyncio
import base64
import binascii
import builtins
import json
import logging
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from botocore.exceptions import BotoCoreError, ClientError
from travel_common.dynamodb import call
from travel_common.exceptions import (
    BadRequest,
    Conflict,
    EntityNotFound,
    ProviderUnavailable,
    UnprocessableEntity,
)

from core_api.domain.models import AccessGrant, Trip, TripSummary, User
from core_api.infrastructure.dynamo import keys
from core_api.infrastructure.dynamo.codec import (
    entity_to_item,
    item_to_entity,
    json_size,
)
from core_api.infrastructure.dynamo.table import GSI1, GSI2, DynamoTable
from core_api.pagination import Page

logger = logging.getLogger(__name__)

STALE = "changed by another request, reload and retry"
EMAIL_TAKEN = "email already registered"

MAX_TRIP_BYTES = 350_000
"""A DynamoDB item holds 400 KB; the guard leaves room for the item's overhead."""

BATCH_SIZE = 25
"""`BatchWriteItem`'s limit."""

BATCH_RETRIES = 6

Item = dict[str, Any]


def profile_item(user: User, version: int) -> Item:
    return entity_to_item(
        user,
        PK=keys.user_pk(user.id),
        SK=keys.PROFILE,
        GSI1PK=keys.USERS,
        GSI1SK=user.email,
        version=version,
    )


def email_item(user: User) -> Item:
    return {
        keys.PK: {"S": keys.email_pk(user.email)},
        keys.SK: {"S": keys.EMAIL},
        "user_id": {"S": str(user.id)},
    }


def trip_item(trip: Trip, version: int) -> Item:
    return entity_to_item(
        trip,
        PK=keys.user_pk(trip.user_id),
        SK=keys.trip_sk(trip.id),
        GSI2PK=keys.TRIPS_GSI2PK,
        GSI2SK=keys.trip_gsi2_sk(trip.created_at, trip.id),
        version=version,
    )


def access_grant_item(grant: AccessGrant) -> Item:
    return entity_to_item(
        grant,
        PK=keys.access_pk(grant.email),
        SK=keys.ACCESS,
        GSI1PK=keys.ACCESS,
        GSI1SK=grant.email,
    )


def encode_cursor(last_key: Item | None) -> str | None:
    """The page's `LastEvaluatedKey` as an opaque cursor: base64url of its JSON."""
    if not last_key:
        return None
    raw = json.dumps(last_key, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(
    cursor: str | None, index_keys: tuple[str, str], partition: str
) -> Item | None:
    """The `ExclusiveStartKey` a cursor stands for.

    Raises:
        BadRequest: this index partition could not have produced it (two lists
            share GSI1, so an accounts cursor is refused by the access list).
    """
    if not cursor:
        return None
    expected = {keys.PK, keys.SK, *index_keys}
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        start = json.loads(base64.urlsafe_b64decode(padded.encode()))
    # RecursionError: JSON nested deeper than the parser goes is not a cursor
    except (binascii.Error, ValueError, UnicodeDecodeError, RecursionError) as exc:
        raise BadRequest("Invalid cursor") from exc
    if (
        not isinstance(start, dict)
        or set(start) != expected
        or not all(
            isinstance(value, dict)
            and set(value) == {"S"}
            and isinstance(value["S"], str)
            for value in start.values()
        )
    ):
        raise BadRequest("Invalid cursor")
    if start[index_keys[0]]["S"] != partition:
        raise BadRequest("Invalid cursor")
    return start


def ensure_fits(trip: Trip) -> None:
    """A trip is one item: refuse it before DynamoDB's 400 KB limit does."""
    if json_size(trip) > MAX_TRIP_BYTES:
        raise UnprocessableEntity("This trip is too large")


class _Store:
    """The table and the calls every repository shares."""

    def __init__(self, table: DynamoTable) -> None:
        self.table = table

    @property
    def _client(self) -> Any:
        return self.table.client

    async def _get(self, pk: str, sk: str) -> Item | None:
        response = await self._call(
            "get_item",
            TableName=self.table.name,
            Key=keys.key(pk, sk),
            ConsistentRead=True,
        )
        return response.get("Item")

    async def _query(
        self, pk: str, sk_prefix: str | None, *, wanted: int | None = None
    ) -> list[Item]:
        """Items under `pk` whose SK starts with `sk_prefix` (all if None), in SK order.

        Reads page by page and stops once `wanted` items are in hand.
        """
        values: dict[str, Any] = {":pk": {"S": pk}}
        condition = "PK = :pk"
        if sk_prefix is not None:
            condition += " AND begins_with(SK, :prefix)"
            values[":prefix"] = {"S": sk_prefix}
        kwargs: dict[str, Any] = {
            "TableName": self.table.name,
            "KeyConditionExpression": condition,
            "ExpressionAttributeValues": values,
            "ConsistentRead": True,
        }
        return await self._paginate(kwargs, wanted)

    async def _paginate(self, kwargs: dict[str, Any], wanted: int | None) -> list[Item]:
        items: list[Item] = []
        while True:
            response = await self._call("query", **kwargs)
            items.extend(response.get("Items", []))
            last = response.get("LastEvaluatedKey")
            if not last or (wanted is not None and len(items) >= wanted):
                return items
            kwargs["ExclusiveStartKey"] = last

    async def _index_page(
        self,
        index: str,
        index_keys: tuple[str, str],
        partition: str,
        *,
        cursor: str | None,
        limit: int,
        newest_first: bool = False,
    ) -> tuple[list[Item], str | None]:
        """One page of an index partition and the cursor to the next one."""
        kwargs: dict[str, Any] = {
            "TableName": self.table.name,
            "IndexName": index,
            "KeyConditionExpression": f"{index_keys[0]} = :partition",
            "ExpressionAttributeValues": {":partition": {"S": partition}},
            "ScanIndexForward": not newest_first,
            "Limit": limit,
        }
        start = decode_cursor(cursor, index_keys, partition)
        if start is not None:
            kwargs["ExclusiveStartKey"] = start
        response = await self._call("query", **kwargs)
        return response.get("Items", []), encode_cursor(
            response.get("LastEvaluatedKey")
        )

    async def _call(
        self, operation: str, /, conflicts: Sequence[str] = (), **kwargs: Any
    ) -> Any:
        """Run one client operation; every repository call goes through here.

        A failed condition becomes a `Conflict` named by `conflicts` (one message
        per transaction item); any other client or transport error is
        `ProviderUnavailable`.
        """
        try:
            return await call(getattr(self._client, operation), **kwargs)
        except ClientError as error:
            conflict = _conflict(error, conflicts) if conflicts else None
            if conflict is not None:
                raise conflict from error
            logger.error("DynamoDB %s failed: %s", operation, error)
            raise ProviderUnavailable("Database unavailable") from error
        except BotoCoreError as error:
            logger.error("DynamoDB %s failed: %s", operation, error)
            raise ProviderUnavailable("Database unavailable") from error

    async def _write(self, operation: str, messages: Sequence[str], **kwargs: Any):
        """Run a write; a failed condition becomes a `Conflict`.

        `messages` names the conflict per transaction item, so a taken email reads
        differently from a stale version.
        """
        return await self._call(operation, conflicts=messages, **kwargs)

    async def _batch(self, requests: list[Item]) -> int:
        """`BatchWriteItem` in chunks of 25, retrying unprocessed requests with backoff.

        Returns how many requests went through.
        """
        done = 0
        for start in range(0, len(requests), BATCH_SIZE):
            pending = requests[start : start + BATCH_SIZE]
            for attempt in range(BATCH_RETRIES):
                response = await self._call(
                    "batch_write_item",
                    RequestItems={self.table.name: pending},
                )
                left = response.get("UnprocessedItems", {}).get(self.table.name, [])
                done += len(pending) - len(left)
                pending = left
                if not pending:
                    break
                await asyncio.sleep(0.05 * 2**attempt)
            else:
                raise ProviderUnavailable("DynamoDB kept throttling a batch write")
        return done

    async def _batch_delete(self, items: list[Item]) -> None:
        await self._batch([{"DeleteRequest": {"Key": _key_of(item)}} for item in items])


def _key_of(item: Item) -> Item:
    return {keys.PK: item[keys.PK], keys.SK: item[keys.SK]}


def _conflict(error: ClientError, messages: Sequence[str]) -> Conflict | None:
    """The `Conflict` a failed condition stands for; None for any other error."""
    code = error.response.get("Error", {}).get("Code")
    if code == "ConditionalCheckFailedException":
        return Conflict(messages[0])
    if code == "TransactionCanceledException":
        reasons = error.response.get("CancellationReasons") or []
        for index, reason in enumerate(reasons):
            if reason.get("Code") == "ConditionalCheckFailed":
                return Conflict(messages[min(index, len(messages) - 1)])
    return None


def _expected(version: int) -> dict[str, Any]:
    return {
        "ConditionExpression": "version = :expected",
        "ExpressionAttributeValues": {":expected": {"N": str(version)}},
    }


class DynamoUserRepository(_Store):
    async def get(self, user_id: UUID) -> User | None:
        item = await self._get(keys.user_pk(user_id), keys.PROFILE)
        return item_to_entity(User, item) if item else None

    async def get_by_email(self, email: str) -> User | None:
        lookup = await self._get(keys.email_pk(email), keys.EMAIL)
        if lookup is None:
            return None
        return await self.get(UUID(lookup["user_id"]["S"]))

    async def list(self, page: Page) -> list[User]:
        kwargs: dict[str, Any] = {
            "TableName": self.table.name,
            "IndexName": GSI1,
            "KeyConditionExpression": "GSI1PK = :users",
            "ExpressionAttributeValues": {":users": {"S": keys.USERS}},
        }
        items = await self._paginate(kwargs, page.skip + page.limit)
        window = items[page.skip : page.skip + page.limit]
        return [item_to_entity(User, item) for item in window]

    async def list_page(
        self, cursor: str | None, limit: int
    ) -> tuple[builtins.list[User], str | None]:
        items, next_cursor = await self._index_page(
            GSI1, (keys.GSI1PK, keys.GSI1SK), keys.USERS, cursor=cursor, limit=limit
        )
        return [item_to_entity(User, item) for item in items], next_cursor

    async def add(self, user: User) -> User:
        await self._write(
            "transact_write_items",
            [STALE, EMAIL_TAKEN],
            TransactItems=[
                {
                    "Put": {
                        "TableName": self.table.name,
                        "Item": profile_item(user, user.version),
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Put": {
                        "TableName": self.table.name,
                        "Item": email_item(user),
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
            ],
        )
        return user

    async def save(self, user: User) -> User:
        stored = await self.get(user.id)
        if stored is None:
            raise EntityNotFound("User", user.id)
        new_version = user.version + 1
        put_profile = {
            "TableName": self.table.name,
            "Item": profile_item(user, new_version),
            **_expected(user.version),
        }
        if keys.email_pk(stored.email) == keys.email_pk(user.email):
            await self._write("put_item", [STALE], **put_profile)
        else:
            await self._write(
                "transact_write_items",
                [STALE, STALE, EMAIL_TAKEN],
                TransactItems=[
                    {"Put": put_profile},
                    {
                        "Delete": {
                            "TableName": self.table.name,
                            "Key": keys.key(keys.email_pk(stored.email), keys.EMAIL),
                            "ConditionExpression": "user_id = :id",
                            "ExpressionAttributeValues": {":id": {"S": str(user.id)}},
                        }
                    },
                    {
                        "Put": {
                            "TableName": self.table.name,
                            "Item": email_item(user),
                            "ConditionExpression": "attribute_not_exists(PK)",
                        }
                    },
                ],
            )
        user.version = new_version
        return user

    async def delete(self, user: User) -> None:
        await self._batch_delete(await self._query(keys.user_pk(user.id), None))
        await self._call(
            "delete_item",
            TableName=self.table.name,
            Key=keys.key(keys.email_pk(user.email), keys.EMAIL),
        )


class DynamoTripRepository(_Store):
    async def get(self, owner_id: UUID, trip_id: UUID) -> Trip | None:
        item = await self._get(keys.user_pk(owner_id), keys.trip_sk(trip_id))
        return item_to_entity(Trip, item) if item else None

    async def list_for(self, owner_id: UUID) -> list[Trip]:
        items = await self._query(keys.user_pk(owner_id), keys.TRIP_PREFIX)
        trips = [item_to_entity(Trip, item) for item in items]
        return sorted(trips, key=lambda trip: (trip.created_at, str(trip.id)))

    async def list_all(
        self, cursor: str | None, limit: int
    ) -> tuple[list[TripSummary], str | None]:
        """Every user's trips, newest first, from GSI2's summary projection."""
        items, next_cursor = await self._index_page(
            GSI2,
            (keys.GSI2PK, keys.GSI2SK),
            keys.TRIPS_GSI2PK,
            cursor=cursor,
            limit=limit,
            newest_first=True,
        )
        return [item_to_entity(TripSummary, item) for item in items], next_cursor

    async def add(self, trip: Trip) -> Trip:
        ensure_fits(trip)
        await self._write(
            "put_item",
            [STALE],
            TableName=self.table.name,
            Item=trip_item(trip, trip.version),
            ConditionExpression="attribute_not_exists(PK)",
        )
        return trip

    async def save(self, trip: Trip) -> Trip:
        ensure_fits(trip)
        new_version = trip.version + 1
        await self._write(
            "put_item",
            [STALE],
            TableName=self.table.name,
            Item=trip_item(trip, new_version),
            **_expected(trip.version),
        )
        trip.version = new_version
        return trip

    async def delete(self, trip: Trip) -> None:
        await self._call(
            "delete_item",
            TableName=self.table.name,
            Key=keys.key(keys.user_pk(trip.user_id), keys.trip_sk(trip.id)),
        )


class DynamoAccessGrantRepository(_Store):
    """Grants by email (ADR 0026).

    They share GSI1 with the accounts under their own `ACCESS` partition.
    """

    async def get(self, email: str) -> AccessGrant | None:
        item = await self._get(keys.access_pk(email), keys.ACCESS)
        return item_to_entity(AccessGrant, item) if item else None

    async def list_page(
        self, cursor: str | None, limit: int
    ) -> tuple[builtins.list[AccessGrant], str | None]:
        items, next_cursor = await self._index_page(
            GSI1, (keys.GSI1PK, keys.GSI1SK), keys.ACCESS, cursor=cursor, limit=limit
        )
        return [item_to_entity(AccessGrant, item) for item in items], next_cursor

    async def put(self, grant: AccessGrant) -> AccessGrant:
        stored = await self.get(grant.email)
        if stored is not None:
            grant.created_at = stored.created_at
            grant.added_by = stored.added_by
        await self._call(
            "put_item",
            TableName=self.table.name,
            Item=access_grant_item(grant),
        )
        return grant

    async def delete(self, email: str) -> bool:
        response = await self._call(
            "delete_item",
            TableName=self.table.name,
            Key=keys.key(keys.access_pk(email), keys.ACCESS),
            ReturnValues="ALL_OLD",
        )
        return bool(response.get("Attributes"))
