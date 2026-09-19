"""FastAPI wiring for ai_api: settings, identity and use cases.

Process-wide resources (the LLM provider, the retriever and their clients) are
created in `main.lifespan` and read from `app.state`; per-request objects are
built here.
"""

from fastapi import Depends, Request
from travel_common.exceptions import ProviderUnavailable
from travel_common.http.auth import extract_bearer_token
from travel_common.principal import Principal
from travel_common.security import principal_from_token

from ai_api.application.plan_trip import PlanTrip
from ai_api.application.record_conversation import RecordConversation
from ai_api.application.stream_chat import StreamChat
from ai_api.config import AISettings, get_settings
from ai_api.domain.ports import (
    ConversationGateway,
    LLMProvider,
    PhotoFinder,
    Retriever,
    TripGateway,
    WeatherForecast,
)
from ai_api.infrastructure.cities import City
from ai_api.infrastructure.core_api_client import CoreApiClient
from ai_api.infrastructure.providers import ChatProvider, planner_cities
from ai_api.prompts import CHAT_SYSTEM_PROMPT


async def get_current_user(
    token: str = Depends(extract_bearer_token),
    settings: AISettings = Depends(get_settings),
) -> Principal:
    """Stateless: the token alone identifies the caller (no database here).

    Local HS256 tokens or the Cognito pool's RS256 ID tokens, per `AUTH_MODE`.
    """
    return principal_from_token(token, settings)


def get_llm_provider(request: Request) -> LLMProvider:
    provider: ChatProvider | None = getattr(request.app.state, "llm_provider", None)
    if provider is None or not provider.is_configured:
        raise ProviderUnavailable("AI chat service not configured")
    return provider


def get_retriever(request: Request) -> Retriever | None:
    """The vector store, or None when RETRIEVAL_ENABLED is off (ADR 0014)."""
    return getattr(request.app.state, "retriever", None)


def get_stream_chat(
    provider: LLMProvider = Depends(get_llm_provider),
    retriever: Retriever | None = Depends(get_retriever),
    settings: AISettings = Depends(get_settings),
) -> StreamChat:
    return StreamChat(
        provider,
        CHAT_SYSTEM_PROMPT,
        retriever=retriever,
        retrieval_limit=settings.RETRIEVAL_LIMIT,
    )


def get_weather(request: Request) -> WeatherForecast | None:
    """The forecast adapter built in `lifespan`, or None (normals only)."""
    return getattr(request.app.state, "weather", None)


def get_photos(request: Request) -> PhotoFinder | None:
    """The Commons lookup built in `lifespan`, or None (illustrative photos only)."""
    return getattr(request.app.state, "photos", None)


def get_cities(
    request: Request, settings: AISettings = Depends(get_settings)
) -> tuple[City, ...]:
    """The cities loaded in `lifespan`; read from the manifest when there is
    no lifespan (tests drive the app without one)."""
    cities: tuple[City, ...] | None = getattr(request.app.state, "cities", None)
    if cities is None:
        cities = planner_cities(settings)
    return cities


def get_plan_trip(
    provider: LLMProvider = Depends(get_llm_provider),
    retriever: Retriever | None = Depends(get_retriever),
    weather: WeatherForecast | None = Depends(get_weather),
    photos: PhotoFinder | None = Depends(get_photos),
    cities: tuple[City, ...] = Depends(get_cities),
    settings: AISettings = Depends(get_settings),
) -> PlanTrip:
    """The planner needs the corpus: without retrieval it cannot show a card."""
    if retriever is None:
        raise ProviderUnavailable("Trip planner needs retrieval (RETRIEVAL_ENABLED)")
    return PlanTrip(
        provider,
        retriever,
        weather=weather,
        photos=photos,
        cities=[city.slug for city in cities],
        max_days=settings.PLANNER_MAX_DAYS,
        candidates=settings.PLANNER_CANDIDATES,
    )


def get_trip_gateway(settings: AISettings = Depends(get_settings)) -> TripGateway:
    return CoreApiClient(settings.CORE_API_URL, settings.API_V1_STR)


def get_conversation_gateway(
    settings: AISettings = Depends(get_settings),
) -> ConversationGateway | None:
    """core_api, or None when recording is switched off."""
    if not settings.CHAT_RECORD_CONVERSATIONS:
        return None
    return CoreApiClient(settings.CORE_API_URL, settings.API_V1_STR)


def get_record_conversation(
    conversations: ConversationGateway | None = Depends(get_conversation_gateway),
) -> RecordConversation | None:
    return RecordConversation(conversations) if conversations is not None else None
