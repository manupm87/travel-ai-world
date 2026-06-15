"""AI chat proxy with streaming support (SSE).

Supports multiple NVIDIA models (Kimi, Llama, StepFun, Cosmos, etc.)
and delegates all streaming logic to ChatService.

This controller is model‑agnostic: the active model is defined in
app.core.constants.NVIDIA_CHAT_MODEL.

"""

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.schemas.chat import ChatRequest
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter()

# Singleton — no DB dependency, just NVIDIA API proxy
_chat_service = ChatService()


@router.post("")
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    Chat endpoint with SSE streaming.

    Model‑agnostic: works with Kimi, Llama, StepFun, Cosmos and any
    NVIDIA-compatible chat model. Accepts user message and optional
    conversation history, returning incremental SSE chunks.
    """    
    if not settings.NVIDIA_API_KEY:
        raise HTTPException(status_code=503, detail="AI chat service not configured")

    """
    Prepare conversation history for the NVIDIA chat/completions API.
    We normalize roles because the frontend may send custom role names
    ("human", "ai", "assistant_message", etc.) and NVIDIA only accepts:
    "user", "assistant", "system".
    """
    messages = [
        {
            "role": _chat_service._normalize_role(msg.role),
            "content": msg.content,
        }
        for msg in request.history
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
