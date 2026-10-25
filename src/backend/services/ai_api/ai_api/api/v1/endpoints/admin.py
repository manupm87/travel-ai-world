"""Admin routes over the turn traces, the daily token counters and the evaluations.

Administrators only. Every route logs one audit line, `admin_read subject=… route=…
target=…`, before it reads anything (the same line `core_api`'s admin routes log). The
answer evaluation is the one route that writes, its own runs (ADR 0039), and logs
`admin_write` instead.
"""

import logging
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from travel_common.exceptions import BadRequest, EntityNotFound, Forbidden
from travel_common.principal import Principal

from ai_api.api.deps import (
    get_check_access,
    get_current_user,
    get_eval_runs,
    get_trace_log,
    get_usage_store,
    require_retriever,
)
from ai_api.application import retrieval_eval, trace_stats
from ai_api.application.access import CheckAccess
from ai_api.application.eval_runs import EvalRuns
from ai_api.config import AISettings, get_settings
from ai_api.domain.ports import Retriever, TraceLog, UsageStore
from ai_api.domain.tracing import Kind, Status, TurnFilters
from ai_api.infrastructure.sse import sse_events
from ai_api.schemas.admin import (
    ExpectedRankResponse,
    RetrievalEvalResponse,
    RetrievalMissResponse,
    RetrievalScoresResponse,
    TraceStatsResponse,
    TurnDetailResponse,
    TurnPageResponse,
)
from ai_api.schemas.answer_eval import (
    AnswerEvalRequest,
    EvalRunDetailResponse,
    EvalRunPageResponse,
)
from ai_api.schemas.usage import AdminUsageItem, AdminUsageResponse

logger = logging.getLogger(__name__)

MAX_ADMIN_PAGE = 200

MAX_STATS_DAYS = 31
"""Most day partitions one stats request reads."""

EVAL_HISTORY = 30
"""Runs the evaluation history lists, newest first."""

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


async def require_admin(principal: Principal = Depends(get_current_user)) -> Principal:
    """The caller, when they are an administrator (the Cognito group `admin`)."""
    if not principal.is_admin:
        raise Forbidden("Administrators only")
    return principal


WRITES = frozenset({"run_answer_eval"})
"""Routes that write (their own evaluation runs): audited as `admin_write`."""


async def audit_admin_read(
    request: Request, principal: Principal = Depends(require_admin)
) -> Principal:
    """The admin behind the request, after one audit line for the read or write."""
    route = getattr(request.scope.get("route"), "name", "")
    action = "admin_write" if route in WRITES else "admin_read"
    params = request.path_params
    target = (
        params.get("turn_id") or params.get("session_id") or params.get("run_id") or "-"
    )
    logger.info(
        "%s subject=%s route=%s target=%s",
        action,
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
    """Turns by session (oldest first), else by day or by user (newest first).

    The other filters apply on top.
    """
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
    """Per-day and total counts, tokens, cost, latency and RAG metrics.

    Over `[start, end]`, at most 31 days.
    """
    if end < start:
        raise BadRequest("end is before start")
    if (end - start).days + 1 > MAX_STATS_DAYS:
        raise BadRequest(f"a range covers at most {MAX_STATS_DAYS} days")
    summaries = [turn async for turn in traces.iter_range(start, end)]
    stats = trace_stats.compute(summaries, start, end)
    return TraceStatsResponse.model_validate(stats)


@router.get("/usage", response_model=AdminUsageResponse)
async def read_usage(
    day: date | None = Query(None, description="A UTC day, `YYYY-MM-DD`; today."),
    usage: UsageStore = Depends(get_usage_store),
    check: CheckAccess = Depends(get_check_access),
):
    """Every account's token counter of one UTC day, most tokens first.

    `day` defaults to today. `tokens` is input + output, what the daily limit counts.
    """
    day = day or check.today()
    counters = sorted(await usage.list_day(day), key=lambda u: (-u.tokens, u.subject))
    return AdminUsageResponse(
        day=day.isoformat(),
        items=[
            AdminUsageItem(
                subject=u.subject,
                input_tokens=u.input_tokens,
                output_tokens=u.output_tokens,
                embed_tokens=u.embed_tokens,
                tokens=u.tokens,
                turns=u.turns,
            )
            for u in counters
        ],
    )


@router.post("/retrieval-eval", response_model=RetrievalEvalResponse)
async def run_retrieval_eval(
    retriever: Retriever = Depends(require_retriever),
    settings: AISettings = Depends(get_settings),
):
    """Recall@5, recall@10 and MRR of the index over every city's 20 questions.

    The run `just eval-retrieval` does: 8 searches at a time, a few seconds and a
    few hundred Titan tokens. Nothing is stored. 503 when retrieval is off.
    """
    report = await retrieval_eval.run(retriever, retrieval_eval.cities_with_questions())
    return RetrievalEvalResponse(
        ran_at=datetime.now(UTC),
        index=f"{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}",
        embeddings_model=settings.EMBEDDINGS_MODEL,
        top_k=retrieval_eval.TOP_K,
        overall=RetrievalScoresResponse.model_validate(report.overall),
        by_city=[RetrievalScoresResponse.model_validate(s) for s in report.by_city],
        by_language=[
            RetrievalScoresResponse.model_validate(s) for s in report.by_language
        ],
        misses=[
            RetrievalMissResponse(
                city=miss.question.city,
                id=miss.question.id,
                lang=miss.question.lang,
                query=miss.question.query,
                expected=[
                    ExpectedRankResponse(doc_id=doc_id, rank=rank)
                    for doc_id, rank in zip(
                        miss.question.expected, miss.ranks, strict=True
                    )
                ],
            )
            for miss in report.misses
        ],
        missing_from_index=report.missing_from_index,
    )


@router.post(
    "/answer-eval",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def run_answer_eval(
    body: AnswerEvalRequest, runs: EvalRuns = Depends(get_eval_runs)
):
    """Run the answer evaluation or the judge validation, streamed (ADR 0039).

    `questions`: the 126 evaluation questions answered by the production model
    and graded by the judge (about 0.6 USD, a few minutes); `golden`: the judge
    alone over the labelled golden set (cents). Events are `progress` per item,
    then `report`, then `[DONE]`; a failure mid-run is an `error` event. The run
    is stored as it goes. 409 while another run is in progress; 503 for
    `questions` when retrieval is off.
    """
    started = await runs.start(body.set)
    return StreamingResponse(
        sse_events(runs.events(started)),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/answer-evals", response_model=EvalRunPageResponse)
async def list_answer_evals(runs: EvalRuns = Depends(get_eval_runs)):
    """The latest evaluation runs, newest first."""
    return EvalRunPageResponse(items=await runs.history(EVAL_HISTORY))


@router.get("/answer-evals/{run_id}", response_model=EvalRunDetailResponse)
async def read_answer_eval(run_id: str, runs: EvalRuns = Depends(get_eval_runs)):
    """One run with every item it graded, in the order of their keys."""
    return await runs.detail(run_id)
