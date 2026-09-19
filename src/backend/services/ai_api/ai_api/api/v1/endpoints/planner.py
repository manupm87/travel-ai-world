"""The trip planner: one turn in, a stream of typed events out (ADR 0015).

Thin controller over the `PlanTrip` use case. The wire format is SSE v2
(`schemas/planner_events.py`), framed by `sse_events`.
"""

import logging

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from travel_common.principal import Principal

from ai_api.api.deps import (
    get_card_detail,
    get_cities,
    get_current_user,
    get_plan_trip,
)
from ai_api.api.v1.endpoints.chat import SSE_HEADERS
from ai_api.application.card_detail import CardDetailLookup
from ai_api.application.plan_trip import PlanTrip
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
    id: str = Query(
        min_length=1,
        max_length=MAX_CARD_ID_CHARS,
        description="The corpus document id the card carries, e.g. `osm:relation/13067`",
    ),
    principal: Principal = Depends(get_current_user),
    detail: CardDetailLookup = Depends(get_card_detail),
) -> CardDetail:
    """One card in full: the article behind it, its address, phone and site.

    The id travels as a query parameter because corpus ids contain slashes
    and colons. It is read back from the store, so the answer never depends
    on what the client kept; an id the index does not hold is a 404. Needs
    retrieval (`RETRIEVAL_ENABLED`), like the planner itself.
    """
    return await detail(id)


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
    principal: Principal = Depends(get_current_user),
    plan_trip: PlanTrip = Depends(get_plan_trip),
) -> StreamingResponse:
    """Stream the planner's answer to one turn for the authenticated user.

    The service keeps no state: the turn carries the brief, the itinerary
    snapshot and the transcript. Events are discriminated on `type` (`text`,
    `brief`, `options`, `itinerary_patch`, `error`, `done`); the stream ends
    with `data: [DONE]`. Needs retrieval (`RETRIEVAL_ENABLED`): every card is
    a corpus document, so without a store the endpoint answers 503.
    """
    logger.info(
        "Planner turn from user %s (%s, %d history turns, %d days)",
        principal.subject,
        turn.action.type if turn.action else "message",
        len(turn.history),
        len(turn.itinerary.days) if turn.itinerary else 0,
    )
    return StreamingResponse(
        sse_events(plan_trip(turn)),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
