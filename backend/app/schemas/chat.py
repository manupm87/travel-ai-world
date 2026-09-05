"""Chat request/response schemas for AI chatbot."""

from typing import Literal

from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    """A single message replayed from the conversation history."""

    role: Literal["user", "assistant"] = Field(
        description="Message role: 'user' or 'assistant'"
    )
    content: str = Field(
        max_length=8_000,
        description="Message content",
    )


class ChatRequest(BaseModel):
    """Incoming chat request body."""

    message: str = Field(
        min_length=1,
        max_length=4_000,
        description="Current user message",
    )
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=40,
        description="Previous conversation messages for context",
    )
