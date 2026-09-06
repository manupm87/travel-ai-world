"""Chat request/response schemas for AI chatbot."""

from typing import Literal

from pydantic import BaseModel, Field

# Request limits.
MAX_MESSAGE_CHARS = 4_000
"""Longest single user turn the endpoint accepts."""

MAX_HISTORY_MESSAGE_CHARS = 8_000
"""Longest replayed turn — assistant answers run longer than user prompts."""

MAX_HISTORY_TURNS = 40
"""How many previous turns a client may replay for context."""


class ChatMessage(BaseModel):
    """A single message replayed from the conversation history."""

    role: Literal["user", "assistant"] = Field(
        description="Message role: 'user' or 'assistant'"
    )
    content: str = Field(
        max_length=MAX_HISTORY_MESSAGE_CHARS,
        description="Message content",
    )


class ChatRequest(BaseModel):
    """Incoming chat request body."""

    message: str = Field(
        min_length=1,
        max_length=MAX_MESSAGE_CHARS,
        description="Current user message",
    )
    history: list[ChatMessage] = Field(
        default_factory=list,
        max_length=MAX_HISTORY_TURNS,
        description="Previous conversation messages for context",
    )
