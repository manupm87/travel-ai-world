"""Admin reads over the turn traces (ADR 0024, TRA-221). Administrators only.

Every route logs one audit line, `admin_read subject=… route=… target=…`,
before it reads anything (the same line `core_api`'s admin routes log).
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from travel_common.exceptions import BadRequest, EntityNotFound, Forbidden
from travel_common.principal import Principal

from ai_api.api.deps import get_current_user, get_trace_log
from ai_api.application import trace_stats
from ai_api.domain.ports import TraceLog
from ai_api.domain.tracing import Kind, Status, TurnFilters
from ai_api.schemas.admin import (
    TraceStatsResponse,
    TurnDetailResponse,
    TurnPageResponse,
)

logger = logging.getLogger(__name__)

MAX_ADMIN_PAGE = 200

MAX_STATS_DAYS = 31
"""Most day partitions one stats request reads."""


async def require_admin(principal: Principal = Depends(get_current_user)) -> Principal:
    """The caller, when they are an administrator (the Cognito group `admin`)."""
    if not principal.is_admin:
        raise Forbidden("Administrators only")
    return principal


async def audit_admin_read(
    request: Request, principal: Principal = Depends(require_admin)
) -> Principal:
    """The admin behind the request, after one audit line for the read."""
    params = request.path_params
    target = params.get("turn_id") or params.get("session_id") or "-"
    logger.info(
        "admin_read subject=%s route=%s target=%s",
        principal.subject,
        request.url.path,
        target,
    )
    return principal


router = APIRouter(dependencies=[Depends(audit_admin_read)])


@router.get("/turns", response_model=TurnPageResponse)
async def list_turns(
    day: date | None = Query(None, description="A UTC day, `YYYY-MM-DD`."),
    kind: Kind | None = Query(None),
    status: Status | None = Query(None),
    subject: str | None = Query(None, description="The token subject of a user."),
    session: str | None = Query(None, description="A planner session id."),
    trip_id: str | None = Query(None),
    city: str | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=MAX_ADMIN_PAGE),
    traces: TraceLog = Depends(get_trace_log),
):
    """Turns by session (oldest first), else by day, else by user (newest
    first), with the other filters applied on top."""
    filters = TurnFilters(
        kind=kind, status=status, subject=subject, trip_id=trip_id, city=city
    )
    if session:
        page = await traces.list_session(session, cursor, limit)
        page.items = [turn for turn in page.items if filters.matches(turn)]
    elif day:
        page = await traces.list_day(day, filters, cursor, limit)
    elif subject:
        page = await traces.list_subject(subject, filters, cursor, limit)
    else:
        raise BadRequest("day, subject or session is required")
    return TurnPageResponse.model_validate(page)


@router.get("/turns/{turn_id}", response_model=TurnDetailResponse)
async def read_turn(turn_id: str, traces: TraceLog = Depends(get_trace_log)):
    """One turn, whole: summary, request context, steps and SSE timeline."""
    detail = await traces.get(turn_id)
    if detail is None:
        raise EntityNotFound("Turn", turn_id)
    return TurnDetailResponse.model_validate(detail)


@router.get("/sessions/{session_id}", response_model=TurnPageResponse)
async def read_session(
    session_id: str,
    cursor: str | None = Query(None),
    limit: int = Query(50, ge=1, le=MAX_ADMIN_PAGE),
    traces: TraceLog = Depends(get_trace_log),
):
    """One planner conversation's turns, oldest first."""
    page = await traces.list_session(session_id, cursor, limit)
    return TurnPageResponse.model_validate(page)


@router.get("/stats", response_model=TraceStatsResponse)
async def read_stats(
    start: date = Query(..., description="First day, `YYYY-MM-DD`."),
    end: date = Query(..., description="Last day, included."),
    traces: TraceLog = Depends(get_trace_log),
):
    """Per-day and total counts, tokens, cost, latency, and the RAG metrics
    over `[start, end]` (at most 31 days)."""
    if end < start:
        raise BadRequest("end is before start")
    if (end - start).days + 1 > MAX_STATS_DAYS:
        raise BadRequest(f"a range covers at most {MAX_STATS_DAYS} days")
    summaries = [turn async for turn in traces.iter_range(start, end)]
    stats = trace_stats.compute(summaries, start, end)
    return TraceStatsResponse.model_validate(stats)
