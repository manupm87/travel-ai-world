"""Server-Sent Events, both directions.

- `SSEParser` reads an upstream provider's byte stream into `data:` payloads.
- `sse_stream` writes our own wire format for the browser:

      data: {"content": "Hola"}
      data: {"thread_id": "..."}          (the exchange was recorded, ADR 0013)
      data: {"error": "...", "error_code": "..."}
      data: [DONE]

- `sse_events` writes the planner's typed stream (SSE v2, TRA-142): one
  event model per line, `data: [DONE]` last.
"""

import json
import logging
from collections.abc import AsyncIterator

from travel_common.exceptions import DomainError

from ai_api.domain.models import ThreadSaved
from ai_api.schemas.planner_events import DoneEvent, PlannerEvent, error_event

logger = logging.getLogger(__name__)

DONE = "data: [DONE]\n\n"
STREAM_FAILED_MESSAGE = "Chat stream failed"


def encode_event(payload: dict[str, str]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


class SSEParser:
    """Incremental line parser; call `feed` per chunk, get complete `data:` bodies."""

    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, chunk: str) -> list[str]:
        self._buffer += chunk
        lines = self._buffer.split("\n")
        self._buffer = lines.pop()
        events: list[str] = []
        for raw in lines:
            line = raw.strip()
            if line.startswith("data:"):
                events.append(line[5:].strip())
        return events


async def sse_stream(events: AsyncIterator[str | ThreadSaved]) -> AsyncIterator[str]:
    """Wrap text deltas (and the recorded thread) into our SSE format; errors
    become a final event.

    The response has already started, so failures are reported in-band. Only
    domain errors carry their message to the client; anything else is logged
    with its traceback and reported generically.
    """
    try:
        async for event in events:
            if isinstance(event, ThreadSaved):
                yield encode_event({"thread_id": event.thread_id})
            else:
                yield encode_event({"content": event})
    except DomainError as exc:
        logger.warning("Chat stream ended with %s: %s", exc.error_code, exc.message)
        yield encode_event({"error": exc.message, "error_code": exc.error_code})
    except Exception:
        logger.exception("Chat stream failed")
        yield encode_event({"error": STREAM_FAILED_MESSAGE, "error_code": "INTERNAL"})
    yield DONE


async def sse_events(events: AsyncIterator[PlannerEvent]) -> AsyncIterator[str]:
    """Frame typed planner events (SSE v2); errors become a final `error` event.

    Same rules as `sse_stream`: the response has already started, so a
    failure is reported in-band, domain errors carry their message and code,
    anything else is logged with its traceback and reported generically. A
    `done` event ends the stream; the `[DONE]` sentinel is always written.
    """
    try:
        async for event in events:
            if isinstance(event, DoneEvent):
                break
            yield f"data: {event.model_dump_json()}\n\n"
    except DomainError as exc:
        logger.warning("Planner stream ended with %s: %s", exc.error_code, exc.message)
        yield f"data: {error_event(exc.message, exc.error_code).model_dump_json()}\n\n"
    except Exception:
        logger.exception("Planner stream failed")
        yield f"data: {error_event(STREAM_FAILED_MESSAGE, 'INTERNAL').model_dump_json()}\n\n"
    yield DONE
