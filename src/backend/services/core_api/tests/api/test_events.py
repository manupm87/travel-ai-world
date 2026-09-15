"""POST /events: direct Lambda invocations (`{"command": ...}`) run named commands."""

from collections.abc import AsyncGenerator

import pytest
from core_api import ops
from core_api.api.events import get_command_runner
from core_api.config import CoreSettings, get_settings
from core_api.main import app
from httpx import AsyncClient
from travel_common.exceptions import BadRequest


class FakeRunner:
    def __init__(self) -> None:
        self.ran: list[str] = []

    async def __call__(self, name: str) -> None:
        if name not in ops.COMMANDS:
            raise BadRequest(f"Unknown command: {name}")
        self.ran.append(name)


@pytest.fixture
def runner() -> FakeRunner:
    """Replaces the runner (and with it the Lambda gate) with a recorder."""
    fake = FakeRunner()
    app.dependency_overrides[get_command_runner] = lambda: fake
    return fake


@pytest.fixture
async def lambda_client(client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    """The same app, as the Lambda runtime would start it."""
    app.dependency_overrides[get_settings] = lambda: CoreSettings(
        AWS_LAMBDA_FUNCTION_NAME="travel-ai-core-api"
    )
    yield client


async def test_migrate_command_is_dispatched(client: AsyncClient, runner: FakeRunner):
    response = await client.post("/events", json={"command": "migrate"})

    assert response.status_code == 200, response.text
    assert response.json() == {"command": "migrate", "status": "ok"}
    assert runner.ran == ["migrate"]


async def test_unknown_command_is_a_400(client: AsyncClient, runner: FakeRunner):
    response = await client.post("/events", json={"command": "drop-everything"})

    assert response.status_code == 400
    assert runner.ran == []


async def test_events_is_not_under_the_versioned_api(client: AsyncClient):
    assert (
        await client.post("/api/v1/events", json={"command": "migrate"})
    ).status_code == 404


async def test_events_only_exists_on_lambda(
    client: AsyncClient, lambda_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    calls: list[str] = []
    monkeypatch.setattr(ops.command, "upgrade", lambda cfg, rev: calls.append(rev))

    on_lambda = await lambda_client.post("/events", json={"command": "migrate"})

    assert on_lambda.status_code == 200, on_lambda.text
    assert calls == ["head"]

    app.dependency_overrides.pop(get_settings)
    elsewhere = await client.post("/events", json={"command": "migrate"})

    assert elsewhere.status_code == 404
    assert calls == ["head"]


async def test_run_command_upgrades_to_head_without_reading_the_ini(
    monkeypatch: pytest.MonkeyPatch,
):
    seen: list[tuple[str | None, str | None, str]] = []
    monkeypatch.setattr(
        ops.command,
        "upgrade",
        lambda cfg, rev: seen.append(
            (cfg.config_file_name, cfg.get_main_option("script_location"), rev)
        ),
    )

    await ops.run_command("migrate")

    assert seen == [(None, "alembic", "head")]


async def test_run_command_rejects_unknown_names():
    with pytest.raises(BadRequest):
        await ops.run_command("nope")
