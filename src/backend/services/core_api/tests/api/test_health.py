from core_api.db.session import get_db
from core_api.main import app
from httpx import AsyncClient
from sqlalchemy.exc import OperationalError


async def test_liveness(client: AsyncClient):
    assert (await client.get("/api/v1/health/")).json()["status"] == "ok"


async def test_db_readiness_ok(client: AsyncClient):
    response = await client.get("/api/v1/health/db")

    assert response.status_code == 200
    assert response.json()["database"] == "connected"


async def test_db_readiness_is_503_when_the_database_is_down(client: AsyncClient):
    class DownSession:
        async def execute(self, *_):
            raise OperationalError("SELECT 1", {}, Exception("refused"))

    async def _down():
        yield DownSession()

    app.dependency_overrides[get_db] = _down

    response = await client.get("/api/v1/health/db")

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"
