"""The access list and the caller's own access (ADR 0026).

No optional wire fields in responses: a nullable value is always present,
`null` when there is none.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AccessResponse(BaseModel):
    """`daily_token_limit` null = unlimited."""

    allowed: bool
    daily_token_limit: int | None

    model_config = ConfigDict(from_attributes=True)


class AccessGrantWrite(BaseModel):
    """`daily_token_limit`: null = the service default, 0 = unlimited."""

    daily_token_limit: int | None = Field(None, ge=0)
    note: str | None = Field(None, max_length=200)


class AccessGrantResponse(BaseModel):
    email: str
    daily_token_limit: int | None
    note: str | None
    added_by: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccessGrantPage(BaseModel):
    items: list[AccessGrantResponse]
    next_cursor: str | None
