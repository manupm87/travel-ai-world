"""FastAPI wiring for ai_api: settings, identity and use cases.

Process-wide resources (the LLM provider and its HTTP client) are created in
`main.lifespan` and read from `app.state`; per-request objects are built here.
"""

from fastapi import Depends, Request
from travel_common.exceptions import ProviderUnavailable
from travel_common.http.auth import extract_bearer_token
from travel_common.principal import Principal
from travel_common.security import principal_from_token

from ai_api.application.stream_chat import StreamChat
from ai_api.config import AISettings, get_settings
from ai_api.domain.ports import LLMProvider, TripGateway
from ai_api.infrastructure.core_api_client import CoreApiClient
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from ai_api.prompts import CHAT_SYSTEM_PROMPT


async def get_current_user(
    token: str = Depends(extract_bearer_token),
    settings: AISettings = Depends(get_settings),
) -> Principal:
    """Stateless: the JWT alone identifies the caller (no database here)."""
    return principal_from_token(token, settings)


def get_llm_provider(request: Request) -> LLMProvider:
    provider: NvidiaProvider | None = getattr(request.app.state, "llm_provider", None)
    if provider is None or not provider.is_configured:
        raise ProviderUnavailable("AI chat service not configured")
    return provider


def get_stream_chat(provider: LLMProvider = Depends(get_llm_provider)) -> StreamChat:
    return StreamChat(provider, CHAT_SYSTEM_PROMPT)


def get_trip_gateway(settings: AISettings = Depends(get_settings)) -> TripGateway:
    return CoreApiClient(settings.CORE_API_URL, settings.API_V1_STR)
