from core_api.api.deps import get_table
from core_api.infrastructure.dynamo.table import DynamoTable
from core_api.main import app
from httpx import AsyncClient


async def test_liveness(client: AsyncClient):
    assert (await client.get("/api/v1/health/")).json()["status"] == "ok"


async def test_db_readiness_ok(client: AsyncClient):
    response = await client.get("/api/v1/health/db")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


async def test_db_readiness_is_503_when_the_table_is_missing(
    client: AsyncClient, table: DynamoTable
):
    app.dependency_overrides[get_table] = lambda: DynamoTable(
        table.client, "no-such-table"
    )

    response = await client.get("/api/v1/health/db")

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"


async def test_db_readiness_is_503_when_dynamodb_is_unreachable(client: AsyncClient):
    class Unreachable:
        def describe_table(self, **_):
            raise ConnectionRefusedError("refused")

    app.dependency_overrides[get_table] = lambda: DynamoTable(Unreachable(), "t")

    response = await client.get("/api/v1/health/db")

    assert response.status_code == 503
