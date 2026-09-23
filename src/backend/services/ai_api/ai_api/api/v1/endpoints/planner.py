"""The trip planner: one turn in, a stream of typed events out (ADR 0015).

Thin controller over the `PlanTrip` use case. The wire format is SSE v2
(`schemas/planner_events.py`), framed by `sse_events`.
"""

import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from travel_common.exceptions import DomainError
from travel_common.principal import Principal

from ai_api.api.deps import (
    get_card_detail,
    get_cities,
    get_current_user,
    get_plan_trip,
    get_record_trace,
    new_tracer,
)
from ai_api.api.v1.endpoints.chat import SSE_HEADERS
from ai_api.application.card_detail import CardDetailLookup
from ai_api.application.plan_trip import PlanTrip, resolve_city
from ai_api.application.record_trace import RecordTrace
from ai_api.application.tracing import TurnTracer, use_tracer
from ai_api.config import AISettings, get_settings
from ai_api.domain.models import City
from ai_api.infrastructure.sse import sse_events
from ai_api.schemas.planner import (
    MAX_CARD_ID_CHARS,
    CardDetail,
    PlannerCity,
    PlannerTurn,
    planner_city,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/cities", response_model=list[PlannerCity])
async def cities(
    principal: Principal = Depends(get_current_user),
    covered: tuple[City, ...] = Depends(get_cities),
) -> list[PlannerCity]:
    """The cities the planner can plan, from the corpus manifest shipped with
    the service: the page offers them as destinations."""
    return [planner_city(city) for city in covered]


@router.get("/card", response_model=CardDetail)
async def card(
    request: Request,
    id: str = Query(
        min_length=1,
        max_length=MAX_CARD_ID_CHARS,
        description="The corpus document id the card carries, e.g. `osm:relation/13067`",
    ),
    principal: Principal = Depends(get_current_user),
    detail: CardDetailLookup = Depends(get_card_detail),
    record: RecordTrace = Depends(get_record_trace),
    settings: AISettings = Depends(get_settings),
) -> CardDetail:
    """One card in full: the article behind it, its address, phone and site.

    The id travels as a query parameter because corpus ids contain slashes
    and colons. It is read back from the store, so the answer never depends
    on what the client kept; an id the index does not hold is a 404. Needs
    retrieval (`RETRIEVAL_ENABLED`), like the planner itself. Traced like a
    turn (ADR 0024), written before the answer is sent.
    """
    tracer = new_tracer("card", request, principal, settings)
    tracer.set_request(message=None, action={"type": "card", "card_id": id})
    try:
        with use_tracer(tracer):
            found = await detail(id)
    except DomainError as exc:
        await record.record(tracer, "error", exc.error_code)
        raise
    await record.record(tracer, "ok", None)
    return found


@router.post(
    "",
    responses={
        200: {
            "description": (
                "Server-Sent Events: one `PlannerEvent` JSON object per `data:` "
                "line, `data: [DONE]` last."
            ),
            "content": {
                "text/event-stream": {
                    "schema": {"$ref": "#/components/schemas/PlannerEvent"}
                }
            },
        }
    },
)
async def planner(
    turn: PlannerTurn,
    request: Request,
    principal: Principal = Depends(get_current_user),
    plan_trip: PlanTrip = Depends(get_plan_trip),
    record: RecordTrace = Depends(get_record_trace),
    covered: tuple[City, ...] = Depends(get_cities),
    settings: AISettings = Depends(get_settings),
) -> StreamingResponse:
    """Stream the planner's answer to one turn for the authenticated user.

    The service keeps no state: the turn carries the brief, the itinerary
    snapshot and the transcript. Events are discriminated on `type` (`text`,
    `brief`, `options`, `itinerary_patch`, `error`, `done`); the stream ends
    with `data: [DONE]`. Needs retrieval (`RETRIEVAL_ENABLED`): every card is
    a corpus document, so without a store the endpoint answers 503. The
    turn's trace is written to the interactions table before `[DONE]`
    (ADR 0024).
    """
    logger.info(
        "Planner turn from user %s (%s, %d history turns, %d days)",
        principal.subject,
        turn.action.type if turn.action else "message",
        len(turn.history),
        len(turn.itinerary.days) if turn.itinerary else 0,
    )
    tracer = new_tracer("planner", request, principal, settings)
    _describe(tracer, turn, covered)
    with use_tracer(tracer):
        events = record(tracer, plan_trip(turn))
    return StreamingResponse(
        sse_events(events),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


def _describe(tracer: TurnTracer, turn: PlannerTurn, covered: tuple[City, ...]) -> None:
    """What the trace keeps of the request (ADR 0024)."""
    tracer.session_id = str(turn.session_id) if turn.session_id else None
    tracer.trip_id = str(turn.trip_id) if turn.trip_id else None
    brief = turn.brief
    city = resolve_city(brief.destination, covered) if brief is not None else None
    tracer.city = city.slug if city is not None else None
    action = turn.action
    if action is None:
        tracer.action = "message"
    elif action.type == "select":
        tracer.action = f"select:{action.group_id}"
    else:
        tracer.action = "remove"
    itinerary_ids: list[str] = []
    if turn.itinerary is not None:
        if turn.itinerary.stay_card_id:
            itinerary_ids.append(turn.itinerary.stay_card_id)
        for day in turn.itinerary.days:
            slots = day.slots
            for ids in (slots.morning, slots.afternoon, slots.evening, slots.night):
                itinerary_ids.extend(ids)
    tracer.set_request(
        message=turn.message,
        action=action.model_dump(mode="json") if action is not None else None,
        brief=brief.model_dump(mode="json") if brief is not None else None,
        itinerary_ids=itinerary_ids,
        exclude_card_ids=turn.exclude_card_ids,
        history=[(m.role, m.content) for m in turn.history],
    )
