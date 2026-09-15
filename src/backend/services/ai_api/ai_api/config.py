from functools import lru_cache

from travel_common.config import CommonSettings


class AISettings(CommonSettings):
    PROJECT_NAME: str = "Travel AI World — AI API"

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

    # Sampling. Tune per deployment, not in code.
    CHAT_MAX_TOKENS: int = 4096
    CHAT_TEMPERATURE: float = 0.7
    CHAT_TOP_P: float = 0.95

    # Where core_api lives, for the calls that persist AI output.
    CORE_API_URL: str = "http://localhost:8000"


@lru_cache
def get_settings() -> AISettings:
    return AISettings()
