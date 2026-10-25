"""core_api settings: shared and DynamoDB ones, the table, Google, access, metrics."""

from functools import lru_cache
from typing import ClassVar, Literal

from pydantic import Field
from pydantic_settings import SettingsConfigDict
from travel_common.config import CommonSettings
from travel_common.dynamodb import DynamoSettings


class CoreSettings(CommonSettings, DynamoSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )

    PROJECT_NAME: str = "Kyrian World — Core API"

    # the one table (ADR 0023); the default names no real table, so a laptop without
    # DYNAMODB_ENDPOINT_URL fails with "table not found" instead of touching AWS
    CORE_TABLE: str = "travel-ai-local-core"

    # local-only business metrics (ADR 0030); never active on Lambda
    METRICS_ENABLED: bool = False
    # trip_created events on the application log, on Lambda too; opt-in
    BUSINESS_EVENTS_ENABLED: bool = False
    METRICS_CITY_SLUGS: list[str] = Field(
        default_factory=lambda: ["budapest"], max_length=100
    )

    GOOGLE_CLIENT_ID: str = ""

    # who may use the app (ADR 0026): "open" is every signed-in account, "allowlist"
    # only admins and invited emails; ai_api asks GET /users/me/access and refuses the same
    ACCESS_MODE: Literal["open", "allowlist"] = "open"
    # tokens per UTC day when the grant sets none; 0 = unlimited; ai_api enforces it
    DEFAULT_DAILY_TOKEN_LIMIT: int = Field(default=300_000, ge=0)

    # set by the Lambda runtime, never in a .env; silences the no-endpoint warning
    AWS_LAMBDA_FUNCTION_NAME: str = ""

    @property
    def on_lambda(self) -> bool:
        return bool(self.AWS_LAMBDA_FUNCTION_NAME)


@lru_cache
def get_settings() -> CoreSettings:
    """Process-wide settings, injected with `Depends(get_settings)`.

    Tests override the dependency (or call `get_settings.cache_clear()`)
    instead of patching a module-level singleton.
    """
    return CoreSettings()
