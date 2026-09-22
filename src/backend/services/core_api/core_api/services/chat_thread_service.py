import uuid

from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.auth.principal import AccountPrincipal
from core_api.domain.models import ChatThread
from core_api.domain.ports import ChatThreadRepository
from core_api.pagination import Page
from core_api.schemas.chat_thread import ChatThreadCreate
from core_api.services import apply_changes


class ChatThreadService:
    """A user's conversations, most recent activity first (ADR 0013)."""

    def __init__(self, threads: ChatThreadRepository) -> None:
        self.threads = threads

    async def list_for(
        self, principal: AccountPrincipal, page: Page = Page()
    ) -> list[ChatThread]:
        threads = await self.threads.list_for(principal.id)
        return threads[page.skip : page.skip + page.limit]

    async def get_owned(
        self, thread_id: uuid.UUID, principal: AccountPrincipal
    ) -> ChatThread:
        """A conversation only exists for the user who owns it (404 otherwise)."""
        thread = await self.threads.get(principal.id, thread_id)
        if thread is None:
            raise EntityNotFound("Chat thread", thread_id)
        return thread

    async def create(self, data: ChatThreadCreate, *, user_id: uuid.UUID) -> ChatThread:
        thread = ChatThread(**data.model_dump(), user_id=user_id)
        thread.check_invariants()
        return await self.threads.add(thread)

    async def update(self, thread: ChatThread, data: BaseModel) -> ChatThread:
        apply_changes(thread, data)
        return await self.threads.save(thread)

    async def delete(self, thread: ChatThread) -> None:
        await self.threads.delete(thread)
