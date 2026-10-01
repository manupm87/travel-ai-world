"""Domain errors reach the client as the stable structured JSON body."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from travel_common.exceptions import (
    AccessDenied,
    DailyTokenLimit,
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
        (AccessDenied(), 403),
        (DailyTokenLimit(), 429),
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

    @app.get("/uninvited")
    async def uninvited():
        raise AccessDenied()

    @app.get("/spent")
    async def spent():
        raise DailyTokenLimit(
            limit=300000, used=300412, resets_at="2026-10-02T00:00:00+00:00"
        )

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


async def test_access_denied_is_a_403_with_its_own_code(app: FastAPI):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.get("/uninvited")

    assert response.status_code == 403
    assert response.json() == {
        "detail": {
            "message": "This account has not been given access yet",
            "error_code": "ACCESS_DENIED",
        }
    }


async def test_daily_token_limit_body(app: FastAPI):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.get("/spent")

    assert response.status_code == 429
    assert response.json() == {
        "detail": {
            "message": "Daily token limit reached",
            "error_code": "DAILY_TOKEN_LIMIT",
            "extras": {
                "limit": 300000,
                "used": 300412,
                "resets_at": "2026-10-02T00:00:00+00:00",
            },
        }
    }
