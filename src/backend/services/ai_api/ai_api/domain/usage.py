"""What a person spent today, and what they may spend (ADR 0026).

`DailyUsage` is the counter `ai_api` keeps per token subject and UTC day;
`Entitlement` is `core_api`'s answer to "may this account use the app, and how
many tokens a day" (`None` = unlimited).
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta


@dataclass(frozen=True, slots=True)
class DailyUsage:
    """One subject's tokens on one UTC day (`YYYY-MM-DD`)."""

    subject: str
    day: str
    input_tokens: int = 0
    output_tokens: int = 0
    embed_tokens: int = 0
    turns: int = 0

    @property
    def tokens(self) -> int:
        """What counts against the daily limit: the LLM's input and output.
        Embedding tokens are kept but not counted."""
        return self.input_tokens + self.output_tokens


@dataclass(frozen=True, slots=True)
class Entitlement:
    """`daily_token_limit` is `None` when the account is unlimited."""

    allowed: bool
    daily_token_limit: int | None


def resets_at(day: date) -> datetime:
    """When the counter of `day` stops counting: the next UTC midnight."""
    return datetime.combine(day, time.min, tzinfo=UTC) + timedelta(days=1)
