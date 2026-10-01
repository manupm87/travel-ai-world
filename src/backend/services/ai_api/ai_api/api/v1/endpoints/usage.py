"""The caller's token usage of the day (ADR 0026)."""

from fastapi import APIRouter, Depends
from travel_common.principal import Principal

from ai_api.api.deps import get_check_access, get_current_user, require_access
from ai_api.application.access import CheckAccess
from ai_api.domain.usage import Entitlement, resets_at
from ai_api.schemas.usage import UsageResponse

router = APIRouter()


@router.get("/me", response_model=UsageResponse)
async def read_my_usage(
    principal: Principal = Depends(get_current_user),
    entitlement: Entitlement = Depends(require_access),
    check: CheckAccess = Depends(get_check_access),
) -> UsageResponse:
    """What the caller spent today (UTC), their daily limit (`null` =
    unlimited, and always `null` with `ACCESS_CONTROL_ENABLED` off) and when
    the counter starts again. Embedding tokens are not counted."""
    day = check.today()
    usage = await check.used(principal.subject, day)
    return UsageResponse(
        day=usage.day,
        used_tokens=usage.tokens,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        turns=usage.turns,
        daily_token_limit=entitlement.daily_token_limit,
        resets_at=resets_at(day),
    )
