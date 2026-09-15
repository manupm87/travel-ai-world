"""`POST /events`: the Lambda Web Adapter's pass-through for non-HTTP invocations.

A direct `aws lambda invoke` with `{"command": "migrate"}` lands here and
runs the command in-process (`core_api.ops`). On Lambda only that IAM call
can reach it (the gateway forwards `/api/*` alone); anywhere else, where a
load balancer might expose the whole port, the route answers 404.
"""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from travel_common.exceptions import EntityNotFound

from core_api.config import CoreSettings, get_settings
from core_api.ops import run_command

router = APIRouter(include_in_schema=False)

CommandRunner = Callable[[str], Awaitable[None]]


def get_command_runner(settings: CoreSettings = Depends(get_settings)) -> CommandRunner:
    if not settings.on_lambda:
        raise EntityNotFound("Resource")
    return run_command


class Event(BaseModel):
    command: str


class EventResult(BaseModel):
    command: str
    status: str = "ok"


@router.post("/events", response_model=EventResult)
async def handle_event(
    event: Event, run: CommandRunner = Depends(get_command_runner)
) -> EventResult:
    await run(event.command)
    return EventResult(command=event.command)
