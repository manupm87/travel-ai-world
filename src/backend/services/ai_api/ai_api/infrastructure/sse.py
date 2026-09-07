"""Server-Sent Events, both directions.

- `SSEParser` reads an upstream provider's byte stream into `data:` payloads.
- `sse_stream` writes our own wire format for the browser:

      data: {"content": "Hola"}
      data: {"error": "...", "error_code": "..."}
      data: [DONE]
"""

import json
import logging
from collections.abc import AsyncIterator

from travel_common.exceptions import DomainError

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


async def sse_stream(deltas: AsyncIterator[str]) -> AsyncIterator[str]:
    """Wrap text deltas into our SSE format; errors become a final event.

    The response has already started, so failures are reported in-band. Only
    domain errors carry their message to the client; anything else is logged
    with its traceback and reported generically.
    """
    try:
        async for delta in deltas:
            yield encode_event({"content": delta})
    except DomainError as exc:
        logger.warning("Chat stream ended with %s: %s", exc.error_code, exc.message)
        yield encode_event({"error": exc.message, "error_code": exc.error_code})
    except Exception:
        logger.exception("Chat stream failed")
        yield encode_event({"error": STREAM_FAILED_MESSAGE, "error_code": "INTERNAL"})
    yield DONE
