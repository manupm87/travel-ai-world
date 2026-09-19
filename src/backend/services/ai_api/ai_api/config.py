from functools import lru_cache
from typing import Literal

from travel_common.config import CommonSettings

LLMProviderName = Literal["nvidia", "bedrock"]


class AISettings(CommonSettings):
    PROJECT_NAME: str = "Travel AI World — AI API"

    # Which adapter answers the chat: NVIDIA (local development, an API key)
    # or Amazon Bedrock (deployed: the function's IAM role, no key). ADR 0009.
    LLM_PROVIDER: LLMProviderName = "nvidia"

    # NVIDIA-hosted chat models (OpenAI-compatible API).
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    # Model-agnostic: any chat model on build.nvidia.com works here. Models get
    # retired without notice (minimax-m3 went 410 on 2026-09-09): check the
    # catalogue when the chat starts answering SERVICE_UNAVAILABLE.
    NVIDIA_CHAT_MODEL: str = "nvidia/nemotron-3-super-120b-a12b"
    # Reasoning models think before answering; hidden reasoning costs tokens
    # and seconds and never reaches the browser, so it is off by default.
    NVIDIA_THINKING: bool = False
    NVIDIA_CONNECT_TIMEOUT: float = 10.0
    NVIDIA_READ_TIMEOUT: float = 120.0
    NVIDIA_MAX_RETRIES: int = 2

    # Amazon Bedrock (LLM_PROVIDER=bedrock). Model IDs are cross-region
    # inference profiles (`eu.` prefix) so requests are served inside the EU.
    # Credentials come from the environment: the Lambda's role in the cloud,
    # the SSO session (AWS_PROFILE) on a laptop. Confirm the IDs with
    # `aws bedrock list-inference-profiles --region eu-west-1`.
    BEDROCK_REGION: str = "eu-west-1"
    BEDROCK_CHAT_MODEL: str = "eu.anthropic.claude-haiku-4-5-20251001-v1:0"
    # Short, cheap completions (conversation titles) go to a smaller model.
    BEDROCK_TITLE_MODEL: str = "eu.amazon.nova-lite-v1:0"
    BEDROCK_CONNECT_TIMEOUT: float = 10.0
    BEDROCK_READ_TIMEOUT: float = 120.0
    BEDROCK_MAX_RETRIES: int = 2

    # Sampling. Tune per deployment, not in code. CHAT_TOP_P is only sent to
    # NVIDIA: Claude 4.5+ on Bedrock refuses temperature and top_p together.
    CHAT_MAX_TOKENS: int = 4096
    CHAT_TEMPERATURE: float = 0.7
    CHAT_TOP_P: float = 0.95

    # Where core_api lives, for the calls that persist AI output.
    CORE_API_URL: str = "http://localhost:8000"
    # Keep every answered exchange in the caller's conversation in core_api
    # (ADR 0013). Off, the chat answers exactly as before and stores nothing.
    CHAT_RECORD_CONVERSATIONS: bool = True

    # Retrieval (ADR 0014). The chat grounds its answers in a corpus of city
    # documents kept in an Amazon S3 Vectors index, searched with the same
    # credentials Bedrock uses. Off by default and off in the cloud until an
    # index holds a corpus: with the flag down the chat answers from the
    # model's own knowledge, exactly as it did before.
    RETRIEVAL_ENABLED: bool = False
    RETRIEVAL_LIMIT: int = 6
    VECTOR_BUCKET: str = "travel-ai-vectors"
    VECTOR_INDEX: str = "city-kb"
    VECTOR_REGION: str = "eu-west-1"

    # Embeddings. Titan V2 is a plain in-Region foundation model, invoked by
    # its bare id (no "eu." inference profile). The dimension belongs to the
    # index: changing it means a new index and a full reindex.
    EMBEDDINGS_MODEL: str = "amazon.titan-embed-text-v2:0"
    EMBEDDINGS_REGION: str = "eu-west-1"
    EMBEDDINGS_DIMENSIONS: int = 1024
    # Titan embeds one text per call; this many calls travel at a time while
    # a corpus is being indexed.
    EMBEDDINGS_CONCURRENCY: int = 8

    # Planner (ADR 0015). Needs retrieval: every card is a corpus document.
    # The cities come from the manifest shipped in the package
    # (`data/cities.json`, written by the corpus tool); a brief for another
    # destination is answered with a polite "not yet" instead of invented
    # places. Unset means every city in the manifest; a list of slugs narrows
    # it for a local run, and an unknown slug stops the service at start-up.
    PLANNER_CITIES: list[str] | None = None
    # Longest draft generated in one turn (days) and how many retrieved
    # documents the model chooses from per part of a day.
    PLANNER_MAX_DAYS: int = 7
    PLANNER_CANDIDATES: int = 8
    # Daily forecast for dates within reach; beyond it the corpus's climate
    # normals are used. A failure never fails a plan.
    OPEN_METEO_URL: str = "https://api.open-meteo.com/v1/forecast"
    OPEN_METEO_TIMEOUT: float = 5.0
    # A card without a corpus image is looked up on Wikimedia Commons at the
    # venue's coordinates (TRA-161); off, only the illustrative fallback shows.
    PHOTOS_ENABLED: bool = True
    COMMONS_API_URL: str = "https://commons.wikimedia.org/w/api.php"
    COMMONS_TIMEOUT: float = 4.0


@lru_cache
def get_settings() -> AISettings:
    return AISettings()
