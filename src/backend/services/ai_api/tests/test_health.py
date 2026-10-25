"""GET /api/v1/ai/health/ and /health/provider: liveness, which adapter answers,
and the 503 a missing or unconfigured provider gives."""

from collections.abc import Iterator

import httpx
import pytest
from ai_api.api.deps import get_llm_provider
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from ai_api.main import app
from httpx import AsyncClient

HEALTH_URL = "/api/v1/ai/health/"
PROVIDER_URL = "/api/v1/ai/health/provider"

_UNSET = object()


@pytest.fixture
def real_provider_dependency() -> Iterator[None]:
    """Drop the conftest override so `get_llm_provider` reads `app.state`."""
    override = app.dependency_overrides.pop(get_llm_provider)
    saved = getattr(app.state, "llm_provider", _UNSET)
    yield
    if saved is _UNSET:
        if hasattr(app.state, "llm_provider"):
            del app.state.llm_provider
    else:
        app.state.llm_provider = saved
    app.dependency_overrides[get_llm_provider] = override


def _never_called(request: httpx.Request) -> httpx.Response:
    pytest.fail(f"unexpected request {request.url}")


async def test_health_answers_without_authentication(client: AsyncClient):
    response = await client.get(HEALTH_URL)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "api": "healthy"}


async def test_provider_health_names_the_adapter(client: AsyncClient):
    response = await client.get(PROVIDER_URL)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "provider": "configured", "name": "fake"}


async def test_an_unconfigured_provider_is_a_503(
    client: AsyncClient, real_provider_dependency: None
):
    async with httpx.AsyncClient(transport=httpx.MockTransport(_never_called)) as http:
        app.state.llm_provider = NvidiaProvider(
            api_key="", base_url="https://nvidia.test", model="m", client=http
        )

        response = await client.get(PROVIDER_URL)

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"


async def test_no_provider_at_all_is_a_503(
    client: AsyncClient, real_provider_dependency: None
):
    if hasattr(app.state, "llm_provider"):
        del app.state.llm_provider

    response = await client.get(PROVIDER_URL)

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"
