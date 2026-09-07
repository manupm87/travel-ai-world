from functools import lru_cache

from travel_common.config import CommonSettings


class AISettings(CommonSettings):
    PROJECT_NAME: str = "Travel AI World — AI API"

    # NVIDIA-hosted chat models (OpenAI-compatible API).
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    # Model-agnostic: any chat model on build.nvidia.com works here.
    NVIDIA_CHAT_MODEL: str = "minimaxai/minimax-m3"
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
