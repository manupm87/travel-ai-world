"""What the services need from storage, as protocols (ADR 0023).

The DynamoDB adapter (`core_api.infrastructure.dynamo.repositories`) is the
only implementation; tests use it over moto. Every method is async. Writes
of a versioned entity (profile, trip, thread) are optimistic: a stale
`version` raises `travel_common.exceptions.Conflict`.
"""

import builtins
from typing import Protocol
from uuid import UUID

from core_api.domain.models import ChatMessage, ChatThread, Trip, TripSummary, User
from core_api.pagination import Page


class UserRepository(Protocol):
    async def get(self, user_id: UUID) -> User | None: ...

    async def get_by_email(self, email: str) -> User | None: ...

    async def list(self, page: Page) -> list[User]:
        """Every account, ordered by email."""
        ...

    async def list_page(
        self, cursor: str | None, limit: int
    ) -> tuple[builtins.list[User], str | None]:
        """Up to `limit` accounts by email after `cursor`, and the next cursor
        (None on the last page). `BadRequest` for a cursor it did not issue."""
        ...

    async def add(self, user: User) -> User:
        """`Conflict` when the email is already registered."""
        ...

    async def save(self, user: User) -> User:
        """An email change moves its uniqueness item in the same transaction;
        `Conflict` when the new email is taken or the version moved."""
        ...

    async def delete(self, user: User) -> None:
        """The account and everything it owns: trips, threads, messages."""
        ...


class TripRepository(Protocol):
    async def get(self, owner_id: UUID, trip_id: UUID) -> Trip | None: ...

    async def list_for(self, owner_id: UUID) -> list[Trip]:
        """All the owner's trips, by `created_at` then `id`."""
        ...

    async def list_all(
        self, cursor: str | None, limit: int
    ) -> tuple[list[TripSummary], str | None]:
        """Every user's trips, newest first, as summaries (the admin list), and
        the next cursor (None on the last page). `BadRequest` for a bad cursor."""
        ...

    async def add(self, trip: Trip) -> Trip: ...

    async def save(self, trip: Trip) -> Trip:
        """The whole aggregate, children included."""
        ...

    async def delete(self, trip: Trip) -> None: ...


class ChatThreadRepository(Protocol):
    async def get(self, owner_id: UUID, thread_id: UUID) -> ChatThread | None: ...

    async def list_for(self, owner_id: UUID) -> list[ChatThread]:
        """All the owner's threads, most recent activity first."""
        ...

    async def add(self, thread: ChatThread) -> ChatThread: ...

    async def save(self, thread: ChatThread) -> ChatThread: ...

    async def delete(self, thread: ChatThread) -> None:
        """The thread and, first, its messages."""
        ...


class ChatMessageRepository(Protocol):
    async def list_in(self, thread_id: UUID, page: Page) -> list[ChatMessage]:
        """A thread's messages, oldest first."""
        ...

    async def append(self, thread: ChatThread, message: ChatMessage) -> ChatMessage:
        """Write the message and move the thread's `updated_at` together."""
        ...
