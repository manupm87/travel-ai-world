import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.api.deps import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def health_check():
    """
    Simple API health check.
    """
    return {"status": "ok", "api": "healthy"}


@router.get("/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    """
    Database connectivity health check.
    """
    try:
        # Perform a simple query to check DB connection
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error("DB health check failed: %s", e)
        return {"status": "error", "database": "disconnected"}
