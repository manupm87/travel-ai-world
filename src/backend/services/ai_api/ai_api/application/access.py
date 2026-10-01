"""Use case: may this account use the app, and has it tokens left today
(ADR 0026).

`core_api` owns the access list and the limits; `ai_api` asks it as the
caller (`AccessGateway`) and keeps the answer per token subject for
`ttl_seconds`, in process. That is how long a changed limit or a removed
grant takes to reach this service. A refusal is never kept, so an invitation
works on the next request.

- `allowed` raises `AccessDenied` (403 `ACCESS_DENIED`) for an account that
  is not on the list.
- `budget` also reads today's counter and raises `DailyTokenLimit`
  (429 `DAILY_TOKEN_LIMIT`) once the day's input + output tokens reach the
  limit. A soft limit: tokens are known when a turn ends, so the turn that
  crosses the line finishes and the next one is refused.

Closed on the list, open on the counter: when `core_api` cannot be asked the
gateway's `ProviderUnavailable` goes through (503, nothing runs); when the
counter cannot be read the turn runs.
"""

import logging
import time
from collections import OrderedDict
from collections.abc import Callable
from datetime import UTC, date, datetime

from travel_common.exceptions import AccessDenied, DailyTokenLimit
from travel_common.principal import Principal

from ai_api.domain.ports import AccessGateway, UsageStore
from ai_api.domain.usage import DailyUsage, Entitlement, resets_at

logger = logging.getLogger(__name__)

MAX_CACHED = 1024
"""Accounts whose answer is kept; beyond, the oldest is dropped."""


def utc_today() -> date:
    return datetime.now(UTC).date()


class CheckAccess:
    def __init__(
        self,
        gateway: AccessGateway,
        usage: UsageStore,
        *,
        ttl_seconds: float = 60,
        clock: Callable[[], float] = time.monotonic,
        today: Callable[[], date] = utc_today,
    ) -> None:
        self._gateway = gateway
        self._usage = usage
        self.ttl_seconds = ttl_seconds
        self._clock = clock
        self.today = today
        self._cache: OrderedDict[str, tuple[float, Entitlement]] = OrderedDict()

    async def allowed(self, principal: Principal, bearer_token: str) -> Entitlement:
        """The caller's entitlement; `AccessDenied` when they are not allowed."""
        entitlement = await self._entitlement(principal.subject, bearer_token)
        if not entitlement.allowed:
            raise AccessDenied()
        return entitlement

    async def budget(self, principal: Principal, bearer_token: str) -> Entitlement:
        """`allowed`, and `DailyTokenLimit` when today's tokens are spent."""
        entitlement = await self.allowed(principal, bearer_token)
        limit = entitlement.daily_token_limit
        if limit is None:
            return entitlement
        day = self.today()
        used = (await self.used(principal.subject, day)).tokens
        if used >= limit:
            raise DailyTokenLimit(
                limit=limit, used=used, resets_at=resets_at(day).isoformat()
            )
        return entitlement

    async def used(self, subject: str, day: date) -> DailyUsage:
        """The subject's counter of the day; zeros when it cannot be read
        (a quota must not take the planner down)."""
        try:
            return await self._usage.get(subject, day)
        except Exception:
            logger.exception("Usage of %s on %s not read", subject, day)
            return DailyUsage(subject=subject, day=day.isoformat())

    async def _entitlement(self, subject: str, bearer_token: str) -> Entitlement:
        now = self._clock()
        cached = self._cache.get(subject)
        if cached is not None and now < cached[0]:
            return cached[1]
        entitlement = await self._gateway.access(bearer_token)
        self._cache.pop(subject, None)
        if entitlement.allowed and self.ttl_seconds > 0:
            self._cache[subject] = (now + self.ttl_seconds, entitlement)
            while len(self._cache) > MAX_CACHED:
                self._cache.popitem(last=False)
        return entitlement
