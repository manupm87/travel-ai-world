"""POST /events: direct Lambda invocations (`{"command": ...}`) run named commands."""

import pytest
from core_api import ops
from core_api.api.events import get_command_runner
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
    fake = FakeRunner()
    app.dependency_overrides[get_command_runner] = lambda: fake
    return fake


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


async def test_run_command_upgrades_to_head(monkeypatch: pytest.MonkeyPatch):
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(
        ops.command,
        "upgrade",
        lambda cfg, rev: calls.append((cfg.config_file_name, rev)),
    )

    await ops.run_command("migrate")

    assert calls == [("alembic.ini", "head")]


async def test_run_command_rejects_unknown_names():
    with pytest.raises(BadRequest):
        await ops.run_command("nope")
