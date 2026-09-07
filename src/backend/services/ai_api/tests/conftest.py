"""Shared fixtures: an app with known settings and a provider that never
touches the network. Nothing here needs a database or an API key."""

from collections.abc import AsyncGenerator

import pytest
from ai_api.api.deps import get_llm_provider
from ai_api.config import AISettings, get_settings
from ai_api.main import app
from ai_api.testing import FakeProvider, settings_for_tests
from httpx import ASGITransport, AsyncClient
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

TEST_SETTINGS = settings_for_tests()


@pytest.fixture
def settings() -> AISettings:
    return TEST_SETTINGS


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
async def client(provider: FakeProvider) -> AsyncGenerator[AsyncClient, None]:
    app.dependency_overrides[get_settings] = lambda: TEST_SETTINGS
    app.dependency_overrides[get_llm_provider] = lambda: provider
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    principal = Principal(id=1, email="chat@example.com", role=Role.USER)
    return {"Authorization": f"Bearer {create_access_token(principal, TEST_SETTINGS)}"}
