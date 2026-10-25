"""Settings every service shares. Each service subclasses and adds its own."""

import re
from typing import ClassVar, Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

AuthMode = Literal["local", "cognito"]
LocalAlgorithm = Literal["HS256", "HS384", "HS512"]


class CommonSettings(BaseSettings):
    PROJECT_NAME: str = "Kyrian World"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # explicit origins, never "*": the app sets allow_credentials=True
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # token issuer (ADR 0009): "local" is core_api's HS256 sign-in (development),
    # "cognito" a user pool's RS256 ID tokens verified against COGNITO_JWKS (deployed)
    AUTH_MODE: AuthMode = "local"

    # local mode; SECRET_KEY must match in every service that verifies tokens
    SECRET_KEY: str = ""
    # HMAC only: anything else ("none" included) is refused at start
    ALGORITHM: LocalAlgorithm = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # cognito mode; COGNITO_JWKS is the pool's jwks.json, inlined by Terraform at
    # deploy time so nothing fetches keys at runtime
    COGNITO_ISSUER: str = ""
    COGNITO_CLIENT_ID: str = ""
    COGNITO_JWKS: str = ""

    # level of the application's own loggers (uvicorn keeps its own)
    LOG_LEVEL: str = "INFO"
    ACCESS_LOG_ENABLED: bool = False

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )


_ENV_LINE = re.compile(r"^\s*#?\s*([A-Z][A-Z0-9_]*)=", re.MULTILINE)


def documented_env_keys(env_example: str) -> set[str]:
    """Variable names an `.env.example` documents, active or commented out.

    Each service's tests compare them with its settings fields, in both directions.
    """
    return set(_ENV_LINE.findall(env_example))
