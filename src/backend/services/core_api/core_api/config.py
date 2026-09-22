from functools import lru_cache

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
