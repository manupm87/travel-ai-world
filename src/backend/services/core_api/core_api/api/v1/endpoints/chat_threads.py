"""Chat threads — every conversation is private to the user who owns it.

Its messages are an append-only log: they are listed and appended through the
owner's thread, never edited or deleted one by one (ADR 0013).
"""

from fastapi import APIRouter, Depends, status

from core_api.api.deps import (
    get_chat_message_service,
    get_chat_thread_service,
    get_current_user,
    get_owned_chat_thread,
    page_params,
)
from core_api.auth.principal import AccountPrincipal
from core_api.domain.models import ChatThread
from core_api.pagination import Page
from core_api.schemas.chat_message import ChatMessageCreate, ChatMessageResponse
from core_api.schemas.chat_thread import (
    ChatThreadCreate,
    ChatThreadResponse,
    ChatThreadUpdate,
)
from core_api.services.chat_message_service import ChatMessageService
from core_api.services.chat_thread_service import ChatThreadService

router = APIRouter()


@router.get("/", response_model=list[ChatThreadResponse])
async def read_chat_threads(
    page: Page = Depends(page_params),
    principal: AccountPrincipal = Depends(get_current_user),
    service: ChatThreadService = Depends(get_chat_thread_service),
):
    """The caller's conversations, most recent activity first (paginated)."""
    return await service.list_for(principal, page)


@router.post(
    "/", response_model=ChatThreadResponse, status_code=status.HTTP_201_CREATED
)
async def create_chat_thread(
    thread_in: ChatThreadCreate,
    principal: AccountPrincipal = Depends(get_current_user),
    service: ChatThreadService = Depends(get_chat_thread_service),
):
    """Start a conversation owned by the caller."""
    return await service.create(thread_in, user_id=principal.id)


@router.get("/{thread_id}", response_model=ChatThreadResponse)
async def read_chat_thread(thread: ChatThread = Depends(get_owned_chat_thread)):
    """Get one of the caller's conversations, without its messages."""
    return thread


@router.patch("/{thread_id}", response_model=ChatThreadResponse)
async def update_chat_thread(
    thread_in: ChatThreadUpdate,  # type: ignore[valid-type]
    thread: ChatThread = Depends(get_owned_chat_thread),
    service: ChatThreadService = Depends(get_chat_thread_service),
):
    """Rename a conversation or change its city."""
    return await service.update(thread, thread_in)


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_thread(
    thread: ChatThread = Depends(get_owned_chat_thread),
    service: ChatThreadService = Depends(get_chat_thread_service),
) -> None:
    """Delete a conversation and all its messages."""
    await service.delete(thread)


@router.get("/{thread_id}/messages/", response_model=list[ChatMessageResponse])
async def read_chat_messages(
    page: Page = Depends(page_params),
    thread: ChatThread = Depends(get_owned_chat_thread),
    service: ChatMessageService = Depends(get_chat_message_service),
):
    """A conversation's messages in the order they were written (paginated)."""
    return await service.list_in(thread, page)


@router.post(
    "/{thread_id}/messages/",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def append_chat_message(
    message_in: ChatMessageCreate,
    thread: ChatThread = Depends(get_owned_chat_thread),
    service: ChatMessageService = Depends(get_chat_message_service),
):
    """Append a turn to one of the caller's conversations.

    An assistant answer may carry its sources, model and usage; a user turn
    carries none of them (422).
    """
    return await service.append(thread, message_in)
