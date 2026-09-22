from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from core_api.domain.enums import ChatRole
from core_api.schemas._types import Count, MessageText


class ChatSource(BaseModel):
    """A corpus document an answer was grounded on."""

    doc_id: str = Field(min_length=1, max_length=512)
    score: float | None = None
    title: str | None = Field(default=None, max_length=512)
    url: str | None = Field(default=None, max_length=2048)


class ChatMessageBase(BaseModel):
    role: ChatRole
    content: MessageText
    # Answers only (the ChatMessage entity rejects them on a user turn).
    sources: list[ChatSource] | None = Field(default=None, max_length=50)
    model: str | None = Field(default=None, max_length=200)
    input_tokens: Count | None = None
    output_tokens: Count | None = None
    latency_ms: Count | None = None


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageResponse(ChatMessageBase):
    id: UUID
    thread_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
