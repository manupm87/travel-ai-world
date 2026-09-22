"""Read-only source for `copy-from-postgres`; deleted with RDS in TRA-219."""

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from core_api.config import CoreSettings


def build_engine(settings: CoreSettings) -> AsyncEngine:
    return create_async_engine(settings.database_url, pool_pre_ping=True)
