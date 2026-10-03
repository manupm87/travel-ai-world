"""The planner's transcript: one replayed message, and what a turn may carry."""

from typing import Literal

from pydantic import BaseModel, Field

# Request limits.
MAX_MESSAGE_CHARS = 4_000
"""Longest message one planner turn carries."""

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
