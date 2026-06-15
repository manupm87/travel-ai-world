from typing import ClassVar, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "FastAPI Enterprise Boilerplate"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    # CORS — list allowed frontend origins explicitly in production.
    # Example: ["https://myapp.com", "http://localhost:3000"]
    # Use ["*"] ONLY in development AND only if allow_credentials is False.
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # DB Engine Selection (postgresql, mysql, sqlite)
    DB_ENGINE: Literal["postgresql", "mysql", "sqlite"] = "postgresql"

    # Database Config (Postgres & MySQL)
    DB_SERVER: str = "127.0.0.1"
    DB_USER: str = ""
    DB_PASSWORD: str = ""
    DB_NAME: str = "fastapi_db"
    DB_PORT: int = 5432

    # SQLite Config
    SQLITE_FILE: str = "sqlite.db"

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DB_ENGINE == "postgresql":
            return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_SERVER}:{self.DB_PORT}/{self.DB_NAME}"
        elif self.DB_ENGINE == "mysql":
            return f"mysql+asyncmy://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_SERVER}:{self.DB_PORT}/{self.DB_NAME}"
        else:  # sqlite
            return f"sqlite+aiosqlite:///{self.SQLITE_FILE}"

    # Security Config
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # NVIDIA AI Chat
    NVIDIA_API_KEY: str = ""

    # Frontend URL (for redirects / CORS)
    FRONTEND_URL: str = "http://localhost:3000"

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )


settings = Settings()
