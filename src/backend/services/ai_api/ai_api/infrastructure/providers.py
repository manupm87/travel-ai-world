"""Which adapters the process runs, as the settings decide.

The use cases and the endpoints only see the ports; this is the one place that knows
the concrete adapters.
"""

from travel_common.dynamodb import dynamodb_client

from ai_api.config import AISettings
from ai_api.domain.ports import EvalStore, InputGuard, TraceLog, UsageStore
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.bedrock_guard import BedrockInputGuard, NullInputGuard
from ai_api.infrastructure.bedrock_provider import BedrockProvider
from ai_api.infrastructure.cities import City, load_cities, select_cities
from ai_api.infrastructure.dynamo_eval import DynamoEvalStore, NullEvalStore
from ai_api.infrastructure.dynamo_traces import DynamoTraceLog, NullTraceLog
from ai_api.infrastructure.dynamo_usage import DynamoUsageStore, NullUsageStore
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from ai_api.infrastructure.s3vectors_retriever import S3VectorsRetriever

ChatProvider = NvidiaProvider | BedrockProvider
"""The adapters `main.lifespan` can put on `app.state.llm_provider`."""


def build_llm_provider(settings: AISettings) -> ChatProvider:
    if settings.LLM_PROVIDER == "bedrock":
        return BedrockProvider.from_settings(settings)
    return NvidiaProvider.from_settings(settings)


def build_judge_provider(settings: AISettings) -> BedrockProvider:
    """The answer evaluation's judge: Bedrock, `JUDGE_MODEL` at `JUDGE_TEMPERATURE`."""
    return BedrockProvider.from_settings(
        settings.model_copy(
            update={
                "BEDROCK_CHAT_MODEL": settings.JUDGE_MODEL,
                "CHAT_TEMPERATURE": settings.JUDGE_TEMPERATURE,
            }
        )
    )


def build_eval_answerer(
    settings: AISettings, provider: ChatProvider
) -> BedrockProvider:
    """The model whose answers the evaluation grades: production's Bedrock model.

    The chat's own provider when it is Bedrock; a Bedrock one beside it otherwise.
    """
    if isinstance(provider, BedrockProvider):
        return provider
    return BedrockProvider.from_settings(settings)


def build_input_guard(settings: AISettings) -> InputGuard:
    """The Bedrock Guardrail, or an allow-all guard when no guardrail id is set."""
    if not settings.BEDROCK_GUARDRAIL_ID:
        return NullInputGuard()
    return BedrockInputGuard.from_settings(settings)


def build_retriever(settings: AISettings) -> S3VectorsRetriever | None:
    """The vector store the planner searches, or None when retrieval is off.

    Off is the local default (on when deployed, Terraform `retrieval_enabled`):
    the planner and the card details then answer 503 and reach no store.
    """
    if not settings.RETRIEVAL_ENABLED:
        return None
    return S3VectorsRetriever.from_settings(
        settings, TitanEmbedder.from_settings(settings)
    )


def planner_cities(settings: AISettings) -> tuple[City, ...]:
    """The cities the planner plans: the manifest, narrowed by `PLANNER_CITIES`.

    An unknown slug raises at start-up, naming the ones the manifest knows.
    """
    return select_cities(load_cities(), settings.PLANNER_CITIES)


def build_trace_log(settings: AISettings) -> TraceLog:
    """The interactions table, or nothing when `INTERACTIONS_TABLE` is empty."""
    if not settings.INTERACTIONS_TABLE:
        return NullTraceLog()
    return DynamoTraceLog(
        dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION),
        settings.INTERACTIONS_TABLE,
        settings.INTERACTION_TTL_DAYS,
    )


def build_usage_store(settings: AISettings) -> UsageStore:
    """The daily token counters, kept in the interactions table (ADR 0026).

    Nothing is counted when `INTERACTIONS_TABLE` is empty.
    """
    if not settings.INTERACTIONS_TABLE:
        return NullUsageStore()
    return DynamoUsageStore(
        dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION),
        settings.INTERACTIONS_TABLE,
        settings.INTERACTION_TTL_DAYS,
    )


def build_eval_store(settings: AISettings) -> EvalStore:
    """The admin's evaluation runs, kept in the interactions table (ADR 0039).

    Nothing is kept when `INTERACTIONS_TABLE` is empty.
    """
    if not settings.INTERACTIONS_TABLE:
        return NullEvalStore()
    return DynamoEvalStore(
        dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION),
        settings.INTERACTIONS_TABLE,
        settings.INTERACTION_TTL_DAYS,
    )
