import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from travel_common.exceptions import ProviderUnavailable

from core_api.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def health_check():
    """Liveness: the process answers."""
    return {"status": "ok", "api": "healthy"}


@router.get("/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    """Readiness: the database answers. 503 (via ProviderUnavailable) when it does not."""
    try:
        await db.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError) as exc:
        logger.error("DB health check failed: %s", exc)
        raise ProviderUnavailable("Database unavailable") from exc
    return {"status": "ok", "database": "connected"}
