"""Server-Sent Events, both directions.

- `SSEParser` reads an upstream provider's byte stream into `data:` payloads.
- `sse_events` writes a typed stream for the browser (the planner's SSE v2, the
  admin's evaluation runs): one event model per line, `data: [DONE]` last.
"""

import logging
from collections.abc import AsyncIterator

from pydantic import BaseModel
from travel_common.exceptions import DomainError

from ai_api.schemas.planner_events import DoneEvent, error_event

logger = logging.getLogger(__name__)

DONE = "data: [DONE]\n\n"
STREAM_FAILED_MESSAGE = "Chat stream failed"


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


async def sse_events(events: AsyncIterator[BaseModel]) -> AsyncIterator[str]:
    """Frame typed events (the planner's SSE v2, the admin's evaluation runs).

    Errors become a final `error` event.

    The response has already started, so a failure is reported in-band:
    domain errors carry their message and code, anything else is logged with
    its traceback and reported generically. A `done` event ends the stream;
    the `[DONE]` sentinel is always written.
    """
    try:
        async for event in events:
            if isinstance(event, DoneEvent):
                break
            yield f"data: {event.model_dump_json()}\n\n"
    except DomainError as exc:
        logger.warning("Stream ended with %s: %s", exc.error_code, exc.message)
        yield f"data: {error_event(exc.message, exc.error_code).model_dump_json()}\n\n"
    except Exception:
        logger.exception("Stream failed")
        yield f"data: {error_event(STREAM_FAILED_MESSAGE, 'INTERNAL').model_dump_json()}\n\n"
    yield DONE
