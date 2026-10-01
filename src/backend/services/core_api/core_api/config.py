from functools import lru_cache
from typing import Literal

from pydantic import Field
from travel_common.config import CommonSettings
from travel_common.dynamodb import DynamoSettings


class CoreSettings(CommonSettings, DynamoSettings):
    PROJECT_NAME: str = "Kyrian World — Core API"

    # The one DynamoDB table core_api keeps everything in (ADR 0023). Terraform
    # sets `travel-ai-core` on AWS; the local default can never name a real
    # table, so a laptop without DYNAMODB_ENDPOINT_URL fails with "table not
    # found" instead of touching production.
    CORE_TABLE: str = "travel-ai-local-core"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Who may use the app (ADR 0026). "open": every signed-in account.
    # "allowlist": administrators and the emails on the access list
    # (`/admin/access`); everyone else gets 403 ACCESS_DENIED from core_api.
    # ai_api asks this service (`GET /users/me/access`) and refuses the same
    # accounts when its ACCESS_CONTROL_ENABLED is on.
    ACCESS_MODE: Literal["open", "allowlist"] = "open"
    # Tokens a person may spend per UTC day when their grant sets no limit of
    # its own; 0 = unlimited. Served by GET /users/me/access; ai_api counts
    # the tokens and enforces it (429 DAILY_TOKEN_LIMIT).
    DEFAULT_DAILY_TOKEN_LIMIT: int = Field(default=300_000, ge=0)

    # Set by the Lambda runtime itself; never in a .env. On Lambda the empty
    # DYNAMODB_ENDPOINT_URL is expected (the regional endpoint), so the start-up
    # warning for a laptop without DynamoDB Local stays quiet.
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
