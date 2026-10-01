"""Which adapters the process runs: the LLM, decided by `LLM_PROVIDER`, the
retriever, switched on by `RETRIEVAL_ENABLED`, and the cities the planner
covers, read from the packaged manifest and narrowed by `PLANNER_CITIES`,
and where the traces and the daily token counters go, decided by
`INTERACTIONS_TABLE` (ADR 0024, ADR 0026).

The use cases and the endpoints only see the ports; this is the one place that
knows the concrete adapters.
"""

from travel_common.dynamodb import dynamodb_client

from ai_api.config import AISettings
from ai_api.domain.ports import TraceLog, UsageStore
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.bedrock_provider import BedrockProvider
from ai_api.infrastructure.cities import City, load_cities, select_cities
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


def build_retriever(settings: AISettings) -> S3VectorsRetriever | None:
    """The vector store the chat searches, or None when retrieval is off.

    Off is the local default (on when deployed, Terraform `retrieval_enabled`):
    the chat then answers from the model's own knowledge and reaches no store.
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
    """The daily token counters, in the interactions table too (ADR 0026);
    nothing is counted when `INTERACTIONS_TABLE` is empty."""
    if not settings.INTERACTIONS_TABLE:
        return NullUsageStore()
    return DynamoUsageStore(
        dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION),
        settings.INTERACTIONS_TABLE,
        settings.INTERACTION_TTL_DAYS,
    )
