"""Chat request/response schemas for AI chatbot."""

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single chat message."""

    role: str = Field(description="Message role: 'user' or 'assistant'")
    content: str = Field(description="Message content")


class ChatRequest(BaseModel):
    """Incoming chat request body."""

    message: str = Field(description="Current user message")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Previous conversation messages for context",
    )
