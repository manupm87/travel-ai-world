"""The trip planner: one turn in, a stream of typed events out (ADR 0015).

Thin controller over the `PlanTrip` use case. The wire format is SSE v2
(`schemas/planner_events.py`), framed by `sse_events`.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from travel_common.principal import Principal

from ai_api.api.deps import get_current_user, get_plan_trip
from ai_api.api.v1.endpoints.chat import SSE_HEADERS
from ai_api.application.plan_trip import PlanTrip
from ai_api.infrastructure.sse import sse_events
from ai_api.schemas.planner import PlannerTurn

logger = logging.getLogger(__name__)

router = APIRouter()


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
