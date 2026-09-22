from functools import lru_cache

from travel_common.config import CommonSettings
from travel_common.dynamodb import DynamoSettings


class CoreSettings(CommonSettings, DynamoSettings):
    PROJECT_NAME: str = "Kyrian World — Core API"

    # PostgreSQL (the only supported engine: migrations use Postgres types)
    DB_SERVER: str = "127.0.0.1"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_NAME: str = "fastapi_db"
    DB_PORT: int = 5432

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_SERVER}:{self.DB_PORT}/{self.DB_NAME}"
        )

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # Set by the Lambda runtime itself; never in a .env. Gates `POST /events`
    # (direct-invocation commands) to the deployment that can only reach it
    # through `aws lambda invoke`.
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
