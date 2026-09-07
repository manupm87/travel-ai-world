"""AI chat with streaming support. Thin controller over the StreamChat use case."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from travel_common.principal import Principal

from ai_api.api.deps import get_current_user, get_stream_chat
from ai_api.application.stream_chat import StreamChat
from ai_api.domain.models import Message
from ai_api.infrastructure.sse import sse_stream
from ai_api.schemas.chat import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter()

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("")
async def chat(
    request: ChatRequest,
    principal: Principal = Depends(get_current_user),
    stream_chat: StreamChat = Depends(get_stream_chat),
) -> StreamingResponse:
    """Stream a chat completion for the authenticated user.

    Wire format, one JSON object per `data:` line, terminated by `[DONE]`:

        data: {"content": "Hola"}
        data: {"error": "..."}
        data: [DONE]

    The `system` prompt is inserted server-side; clients may only send
    `user` and `assistant` turns.
    """
    logger.info(
        "Chat request from user %s (%d history turns)",
        principal.id,
        len(request.history),
    )
    history = [Message(m.role, m.content) for m in request.history]
    return StreamingResponse(
        sse_stream(stream_chat(request.message, history)),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
