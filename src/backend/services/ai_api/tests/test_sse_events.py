"""`sse_events` (TRA-142): the framing of the planner's typed stream and what
reaches the browser when it fails."""

import json
from collections.abc import AsyncIterator

from ai_api.infrastructure.sse import STREAM_FAILED_MESSAGE, sse_events
from ai_api.schemas.planner_events import (
    PlannerEvent,
    TripBrief,
    brief_event,
    done,
    text,
)
from travel_common.exceptions import ProviderUnavailable, Unauthorized


async def collect(events: AsyncIterator[PlannerEvent]) -> list[str]:
    return [line async for line in sse_events(events)]


def payloads(lines: list[str]) -> list[dict | str]:
    out: list[dict | str] = []
    for line in lines:
        assert line.startswith("data: ") and line.endswith("\n\n"), line
        body = line[len("data: ") : -2]
        out.append(body if body == "[DONE]" else json.loads(body))
    return out


async def test_frames_every_event_and_ends_with_done():
    async def events() -> AsyncIterator[PlannerEvent]:
        yield text("Hola")
        yield brief_event(TripBrief.empty())

    lines = await collect(events())

    parsed = payloads(lines)
    assert parsed[0] == {"type": "text", "delta": "Hola"}
    assert isinstance(parsed[1], dict) and parsed[1]["type"] == "brief"
    assert parsed[-1] == "[DONE]"
    assert len(parsed) == 3


async def test_a_done_event_ends_the_stream_once():
    async def events() -> AsyncIterator[PlannerEvent]:
        yield text("a")
        yield done()
        yield text("never")  # pragma: no cover - the consumer stopped

    parsed = payloads(await collect(events()))

    assert parsed == [{"type": "text", "delta": "a"}, "[DONE]"]


async def test_domain_error_becomes_an_error_event_with_its_code():
    async def events() -> AsyncIterator[PlannerEvent]:
        yield text("partial ")
        raise Unauthorized("Session expired")

    parsed = payloads(await collect(events()))

    assert parsed == [
        {"type": "text", "delta": "partial "},
        {"type": "error", "error": "Session expired", "error_code": "UNAUTHORIZED"},
        "[DONE]",
    ]


async def test_provider_failure_keeps_its_message_generic():
    async def events() -> AsyncIterator[PlannerEvent]:
        raise ProviderUnavailable("AI provider error")
        yield  # pragma: no cover

    parsed = payloads(await collect(events()))

    assert parsed[0] == {
        "type": "error",
        "error": "AI provider error",
        "error_code": "SERVICE_UNAVAILABLE",
    }


async def test_unexpected_exception_never_reaches_the_client():
    secret = "boto3 said: AccessDenied arn:aws:iam::123456789012:role/x"

    async def events() -> AsyncIterator[PlannerEvent]:
        raise RuntimeError(secret)
        yield  # pragma: no cover

    lines = await collect(events())

    assert secret not in "".join(lines)
    assert payloads(lines)[0] == {
        "type": "error",
        "error": STREAM_FAILED_MESSAGE,
        "error_code": "INTERNAL",
    }
    assert payloads(lines)[-1] == "[DONE]"
