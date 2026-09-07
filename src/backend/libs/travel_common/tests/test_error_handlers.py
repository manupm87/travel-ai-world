"""Domain errors reach the client as the stable structured JSON body."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from travel_common.exceptions import (
    DomainError,
    EntityNotFound,
    Forbidden,
    ProviderUnavailable,
    Unauthorized,
)
from travel_common.http.error_handlers import register_error_handlers, status_for


class _CustomNotFound(EntityNotFound):
    """Subclasses inherit their parent's status code."""


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (Unauthorized(), 401),
        (Forbidden(), 403),
        (EntityNotFound("Trip", 7), 404),
        (_CustomNotFound("Meal"), 404),
        (ProviderUnavailable(), 503),
        (DomainError("unmapped"), 500),
    ],
)
def test_status_for(exc: DomainError, expected: int):
    assert status_for(exc) == expected


@pytest.fixture
def app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/missing")
    async def missing():
        raise EntityNotFound("Trip", "abc")

    @app.get("/private")
    async def private():
        raise Unauthorized()

    return app


async def test_not_found_body(app: FastAPI):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.get("/missing")

    assert response.status_code == 404
    assert response.json() == {
        "detail": {
            "message": "Trip not found",
            "error_code": "NOT_FOUND",
            "extras": {"id": "abc"},
        }
    }


async def test_unauthorized_sets_challenge_header(app: FastAPI):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.get("/private")

    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    assert response.json()["detail"]["error_code"] == "UNAUTHORIZED"
