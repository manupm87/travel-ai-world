from fastapi import APIRouter, Depends

from core_api.api.deps import get_table
from core_api.infrastructure.dynamo.table import DynamoTable

router = APIRouter()


@router.get("/")
async def health_check():
    """Liveness: the process answers."""
    return {"status": "ok", "api": "healthy"}


@router.get("/db")
async def db_health_check(table: DynamoTable = Depends(get_table)):
    """Readiness: the table answers. 503 (via ProviderUnavailable) when it does not."""
    await table.ping()
    return {"status": "ok", "database": "connected"}
