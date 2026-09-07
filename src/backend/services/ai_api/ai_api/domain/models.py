"""Pure domain types. No framework imports."""

from dataclasses import dataclass, field
from typing import Literal

ChatRole = Literal["system", "user", "assistant"]
"""Who speaks in a chat turn (not to be confused with a user's account Role)."""


@dataclass(frozen=True, slots=True)
class Message:
    role: ChatRole
    content: str


@dataclass(frozen=True, slots=True)
class Document:
    """A retrieved passage that can ground an answer (RAG)."""

    id: str
    content: str
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class GenerationParams:
    """Sampling settings handed to whichever provider answers."""

    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.95
