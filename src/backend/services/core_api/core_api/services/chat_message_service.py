from core_api.domain.models import ChatMessage, ChatThread
from core_api.domain.ports import ChatMessageRepository
from core_api.pagination import Page
from core_api.schemas.chat_message import ChatMessageCreate


class ChatMessageService:
    """Messages are an append-only log inside a thread the caller owns."""

    def __init__(self, messages: ChatMessageRepository) -> None:
        self.messages = messages

    async def list_in(
        self, thread: ChatThread, page: Page = Page()
    ) -> list[ChatMessage]:
        return await self.messages.list_in(thread.id, page)

    async def append(self, thread: ChatThread, data: ChatMessageCreate) -> ChatMessage:
        message = ChatMessage(**data.model_dump(), thread_id=thread.id)
        message.check_invariants()
        return await self.messages.append(thread, message)
