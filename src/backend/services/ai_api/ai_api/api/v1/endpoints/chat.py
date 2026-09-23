"""AI chat with streaming support. Thin controller over the StreamChat use case."""

import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from travel_common.http.auth import extract_bearer_token
from travel_common.principal import Principal

from ai_api.api.deps import (
    get_current_user,
    get_record_conversation,
    get_record_trace,
    get_stream_chat,
    new_tracer,
)
from ai_api.application.record_conversation import RecordConversation
from ai_api.application.record_trace import RecordTrace
from ai_api.application.stream_chat import StreamChat
from ai_api.application.tracing import use_tracer
from ai_api.config import AISettings, get_settings
from ai_api.domain.models import ChatTrace, Message, ThreadSaved
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
    http_request: Request,
    principal: Principal = Depends(get_current_user),
    bearer_token: str = Depends(extract_bearer_token),
    stream_chat: StreamChat = Depends(get_stream_chat),
    record: RecordConversation | None = Depends(get_record_conversation),
    record_trace: RecordTrace = Depends(get_record_trace),
    settings: AISettings = Depends(get_settings),
) -> StreamingResponse:
    """Stream a chat completion for the authenticated user.

    Wire format, one JSON object per `data:` line, terminated by `[DONE]`:

        data: {"content": "Hola"}
        data: {"thread_id": "..."}
        data: {"error": "..."}
        data: [DONE]

    The `system` prompt is inserted server-side; clients may only send
    `user` and `assistant` turns. Once the answer is complete, the exchange is
    recorded in the caller's conversation (`thread_id`, or a new one) and
    `{"thread_id"}` is sent before `[DONE]`; if recording fails, the answer is
    still delivered and that event is simply missing. The answer's trace
    is written to the interactions table before `[DONE]` (ADR 0024).
    """
    logger.info(
        "Chat request from user %s (%d history turns)",
        principal.subject,
        len(request.history),
    )
    history = [Message(m.role, m.content) for m in request.history]
    tracer = new_tracer("chat", http_request, principal, settings)
    tracer.session_id = str(request.thread_id) if request.thread_id else None
    tracer.set_request(
        message=request.message,
        history=[(m.role, m.content) for m in request.history],
    )
    trace = ChatTrace()
    with use_tracer(tracer):
        answer = stream_chat(request.message, history, trace=trace)
        events: AsyncIterator[str | ThreadSaved] = answer
        if record is not None:
            thread_id = str(request.thread_id) if request.thread_id else None
            events = record(
                bearer_token, request.message, answer, trace, thread_id=thread_id
            )
        events = record_trace.chat(tracer, events)
    return StreamingResponse(
        sse_stream(events),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )
