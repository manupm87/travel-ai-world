"""Settings every service shares. Each service subclasses and adds its own."""

import re
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class CommonSettings(BaseSettings):
    PROJECT_NAME: str = "Travel AI World"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # CORS — list allowed frontend origins explicitly in production.
    # allow_credentials=True forbids "*", so this must never be a wildcard.
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # JWT. SECRET_KEY must be identical in every service that verifies tokens.
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Root log level for the application's own loggers (uvicorn keeps its own).
    LOG_LEVEL: str = "INFO"

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )


_ENV_LINE = re.compile(r"^\s*#?\s*([A-Z][A-Z0-9_]*)=", re.MULTILINE)


def documented_env_keys(env_example: str) -> set[str]:
    """Variable names an `.env.example` documents, active or commented out.

    Each service's tests compare this with its `Settings.model_fields`, so a
    setting cannot be added without documenting it, nor documented without
    existing.
    """
    return set(_ENV_LINE.findall(env_example))
