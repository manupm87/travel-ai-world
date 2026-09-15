"""`POST /events`: the Lambda Web Adapter's pass-through for non-HTTP invocations.

Outside Lambda nothing routes here (the gateway and CloudFront only forward
`/api/*`); a direct `aws lambda invoke` with `{"command": "migrate"}` lands
here and runs the command in-process (`core_api.ops`).
"""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core_api.ops import run_command

router = APIRouter(include_in_schema=False)

CommandRunner = Callable[[str], Awaitable[None]]


def get_command_runner() -> CommandRunner:
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
