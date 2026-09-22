"""The domain's repository ports over the core table (ADR 0023).

Every write of a versioned item (profile, trip, thread) is conditional:
`attribute_not_exists(PK)` when it is created, `version = :expected` when it
changes. A failed condition is a `Conflict` ("reload and retry"), never a
silent overwrite. There are no database cascades, so deletes walk what an
item owns and remove it in batches.
"""

import asyncio
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from botocore.exceptions import ClientError
from travel_common.dynamodb import call, from_item
from travel_common.exceptions import (
    Conflict,
    EntityNotFound,
    ProviderUnavailable,
    UnprocessableEntity,
)

from core_api.domain.models import ChatMessage, ChatThread, Trip, User
from core_api.infrastructure.dynamo import keys
from core_api.infrastructure.dynamo.codec import (
    entity_to_item,
    item_to_entity,
    json_size,
)
from core_api.infrastructure.dynamo.table import GSI1, DynamoTable
from core_api.pagination import Page

STALE = "changed by another request, reload and retry"
EMAIL_TAKEN = "email already registered"

MAX_TRIP_BYTES = 350_000
"""A DynamoDB item holds 400 KB; the guard leaves room for the item's overhead."""

BATCH_SIZE = 25
"""`BatchWriteItem`'s limit."""

BATCH_RETRIES = 6

Item = dict[str, Any]


# ── Items ───────────────────────────────────────────────────────────────────


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
        trip, PK=keys.user_pk(trip.user_id), SK=keys.trip_sk(trip.id), version=version
    )


def thread_item(thread: ChatThread, version: int) -> Item:
    return entity_to_item(
        thread,
        PK=keys.user_pk(thread.user_id),
        SK=keys.thread_sk(thread.id),
        version=version,
    )


def message_item(message: ChatMessage) -> Item:
    return entity_to_item(
        message,
        PK=keys.thread_pk(message.thread_id),
        SK=keys.message_sk(message.created_at, message.id),
    )


def ensure_fits(trip: Trip) -> None:
    """A trip is one item: refuse it before DynamoDB's 400 KB limit does."""
    if json_size(trip) > MAX_TRIP_BYTES:
        raise UnprocessableEntity("This trip is too large")


# ── Shared calls ────────────────────────────────────────────────────────────


class _Store:
    """The table and the calls every repository shares."""

    def __init__(self, table: DynamoTable) -> None:
        self.table = table

    @property
    def _client(self) -> Any:
        return self.table.client

    async def _get(self, pk: str, sk: str) -> Item | None:
        response = await call(
            self._client.get_item,
            TableName=self.table.name,
            Key=keys.key(pk, sk),
            ConsistentRead=True,
        )
        return response.get("Item")

    async def _query(
        self, pk: str, sk_prefix: str | None, *, wanted: int | None = None
    ) -> list[Item]:
        """Items under `pk` whose SK starts with `sk_prefix` (every item when
        None), in SK order, page by page, stopping once `wanted` are in hand."""
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
            response = await call(self._client.query, **kwargs)
            items.extend(response.get("Items", []))
            last = response.get("LastEvaluatedKey")
            if not last or (wanted is not None and len(items) >= wanted):
                return items
            kwargs["ExclusiveStartKey"] = last

    async def _write(self, operation: str, messages: Sequence[str], **kwargs: Any):
        """Run a write; a failed condition becomes a `Conflict`.

        `messages` names the conflict per transaction item (one entry for a
        single-item write), so a taken email reads differently from a stale
        version.
        """
        try:
            return await call(getattr(self._client, operation), **kwargs)
        except ClientError as error:
            raise _conflict_or_raise(error, messages) from error

    async def _batch(self, requests: list[Item]) -> int:
        """`BatchWriteItem` 25 requests at a time, retrying what DynamoDB left
        unprocessed with backoff. Returns how many requests went through."""
        done = 0
        for start in range(0, len(requests), BATCH_SIZE):
            pending = requests[start : start + BATCH_SIZE]
            for attempt in range(BATCH_RETRIES):
                response = await call(
                    self._client.batch_write_item,
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

    async def _delete_thread_items(self, owner_id: UUID, thread_id: UUID) -> None:
        """A thread's messages, then the thread itself."""
        await self._batch_delete(
            await self._query(keys.thread_pk(thread_id), keys.MSG_PREFIX)
        )
        await call(
            self._client.delete_item,
            TableName=self.table.name,
            Key=keys.key(keys.user_pk(owner_id), keys.thread_sk(thread_id)),
        )


def _key_of(item: Item) -> Item:
    return {keys.PK: item[keys.PK], keys.SK: item[keys.SK]}


def _conflict_or_raise(error: ClientError, messages: Sequence[str]) -> Exception:
    code = error.response.get("Error", {}).get("Code")
    if code == "ConditionalCheckFailedException":
        return Conflict(messages[0])
    if code == "TransactionCanceledException":
        reasons = error.response.get("CancellationReasons") or []
        for index, reason in enumerate(reasons):
            if reason.get("Code") == "ConditionalCheckFailed":
                return Conflict(messages[min(index, len(messages) - 1)])
    return error


def _expected(version: int) -> dict[str, Any]:
    return {
        "ConditionExpression": "version = :expected",
        "ExpressionAttributeValues": {":expected": {"N": str(version)}},
    }


# ── Users ───────────────────────────────────────────────────────────────────


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
        owner = keys.user_pk(user.id)
        for thread in await self._query(owner, keys.THREAD_PREFIX):
            await self._delete_thread_items(user.id, UUID(from_item(thread)["id"]))
        await self._batch_delete(await self._query(owner, None))
        await call(
            self._client.delete_item,
            TableName=self.table.name,
            Key=keys.key(keys.email_pk(user.email), keys.EMAIL),
        )


# ── Trips ───────────────────────────────────────────────────────────────────


class DynamoTripRepository(_Store):
    async def get(self, owner_id: UUID, trip_id: UUID) -> Trip | None:
        item = await self._get(keys.user_pk(owner_id), keys.trip_sk(trip_id))
        return item_to_entity(Trip, item) if item else None

    async def list_for(self, owner_id: UUID) -> list[Trip]:
        items = await self._query(keys.user_pk(owner_id), keys.TRIP_PREFIX)
        trips = [item_to_entity(Trip, item) for item in items]
        return sorted(trips, key=lambda trip: (trip.created_at, str(trip.id)))

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
        await call(
            self._client.delete_item,
            TableName=self.table.name,
            Key=keys.key(keys.user_pk(trip.user_id), keys.trip_sk(trip.id)),
        )


# ── Conversations ───────────────────────────────────────────────────────────


class DynamoChatThreadRepository(_Store):
    async def get(self, owner_id: UUID, thread_id: UUID) -> ChatThread | None:
        item = await self._get(keys.user_pk(owner_id), keys.thread_sk(thread_id))
        return item_to_entity(ChatThread, item) if item else None

    async def list_for(self, owner_id: UUID) -> list[ChatThread]:
        items = await self._query(keys.user_pk(owner_id), keys.THREAD_PREFIX)
        threads = [item_to_entity(ChatThread, item) for item in items]
        # Most recent activity first; the id breaks ties in a stable order.
        threads.sort(key=lambda thread: str(thread.id))
        threads.sort(key=lambda thread: thread.updated_at, reverse=True)
        return threads

    async def add(self, thread: ChatThread) -> ChatThread:
        await self._write(
            "put_item",
            [STALE],
            TableName=self.table.name,
            Item=thread_item(thread, thread.version),
            ConditionExpression="attribute_not_exists(PK)",
        )
        return thread

    async def save(self, thread: ChatThread) -> ChatThread:
        new_version = thread.version + 1
        await self._write(
            "put_item",
            [STALE],
            TableName=self.table.name,
            Item=thread_item(thread, new_version),
            **_expected(thread.version),
        )
        thread.version = new_version
        return thread

    async def delete(self, thread: ChatThread) -> None:
        await self._delete_thread_items(thread.user_id, thread.id)


class DynamoChatMessageRepository(_Store):
    async def list_in(self, thread_id: UUID, page: Page) -> list[ChatMessage]:
        items = await self._query(
            keys.thread_pk(thread_id), keys.MSG_PREFIX, wanted=page.skip + page.limit
        )
        window = items[page.skip : page.skip + page.limit]
        return [item_to_entity(ChatMessage, item) for item in window]

    async def _last_created_at(self, thread_id: UUID) -> datetime | None:
        response = await call(
            self._client.query,
            TableName=self.table.name,
            KeyConditionExpression="PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues={
                ":pk": {"S": keys.thread_pk(thread_id)},
                ":prefix": {"S": keys.MSG_PREFIX},
            },
            ScanIndexForward=False,
            Limit=1,
            ConsistentRead=True,
        )
        items = response.get("Items", [])
        return item_to_entity(ChatMessage, items[0]).created_at if items else None

    async def append(self, thread: ChatThread, message: ChatMessage) -> ChatMessage:
        """Write the message and bump the thread in one transaction.

        The sort key is the order (ADR 0013): a message never sorts before the
        one already last, even when both carry the same clock reading.
        """
        last = await self._last_created_at(thread.id)
        if last is not None and message.created_at <= last:
            message.created_at = last + timedelta(microseconds=1)
        # The thread is bumped, not compared: an append never conflicts with a
        # rename or another append (ai_api writes question and answer back to
        # back), it only requires the thread to still exist.
        await self._write(
            "transact_write_items",
            [STALE, "the conversation no longer exists"],
            TransactItems=[
                {
                    "Put": {
                        "TableName": self.table.name,
                        "Item": message_item(message),
                        "ConditionExpression": "attribute_not_exists(PK)",
                    }
                },
                {
                    "Update": {
                        "TableName": self.table.name,
                        "Key": keys.key(
                            keys.user_pk(thread.user_id), keys.thread_sk(thread.id)
                        ),
                        "UpdateExpression": "SET updated_at = :now ADD version :one",
                        "ConditionExpression": "attribute_exists(PK)",
                        "ExpressionAttributeValues": {
                            ":now": {"S": message.created_at.isoformat()},
                            ":one": {"N": "1"},
                        },
                    }
                },
            ],
        )
        thread.updated_at = message.created_at
        thread.version += 1
        return message
