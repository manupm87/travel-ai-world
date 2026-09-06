"""AI chat proxy with streaming support.

Thin controller: delegates to ChatService for streaming logic.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton — no DB dependency, just an upstream provider proxy
_chat_service = ChatService()


@router.post("")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Stream a chat completion for the authenticated user.

    Accepts user message + optional conversation history.
    Returns Server-Sent Events (SSE) with incremental content chunks.

    Wire format, one JSON object per `data:` line, terminated by `[DONE]`:
    Example:

        data: {"content": "Hola"}
        data: {"content": " que"}
        data: {"error": "..."}
        data: [DONE]

    The `system` prompt is inserted by the backend; clients may only send
    `user` and `assistant` turns.
    """
    if not settings.NVIDIA_API_KEY:
        raise HTTPException(status_code=503, detail="AI chat service not configured")

    logger.info(
        "Chat request from user %s (%d history turns)",
        current_user.id,
        len(request.history),
    )

    messages: list[dict[str, str]] = [
        {"role": msg.role, "content": msg.content} for msg in request.history
    ]
    messages.append({"role": "user", "content": request.message})

    return StreamingResponse(
        _chat_service.stream_completion(messages),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
