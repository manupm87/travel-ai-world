"""The daily token usage, for the caller and for the admin console (ADR 0026).

Nothing has a default: every field is sent (`null` when unknown), like the
other schemas of this service.
"""

from datetime import datetime

from pydantic import BaseModel


class UsageResponse(BaseModel):
    """What the caller spent today (UTC) and what they may spend:
    `used_tokens` is input + output, what the limit counts;
    `daily_token_limit` is `null` when unlimited (or when
    `ACCESS_CONTROL_ENABLED` is off); `resets_at` is the next UTC midnight."""

    day: str
    used_tokens: int
    input_tokens: int
    output_tokens: int
    turns: int
    daily_token_limit: int | None
    resets_at: datetime


class AdminUsageItem(BaseModel):
    """One account's counter; `tokens` is input + output, what the limit counts."""

    subject: str
    input_tokens: int
    output_tokens: int
    embed_tokens: int
    tokens: int
    turns: int


class AdminUsageResponse(BaseModel):
    """Every account's counter of one UTC day, most tokens first."""

    day: str
    items: list[AdminUsageItem]
