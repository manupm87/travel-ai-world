"""POST /events: direct Lambda invocations (`{"command": ...}`) run named commands."""

from collections.abc import AsyncGenerator
from typing import Any

import pytest
from core_api import ops
from core_api.api.events import get_command_runner
from core_api.config import CoreSettings, get_settings
from core_api.main import app
from httpx import AsyncClient
from travel_common.exceptions import BadRequest


class FakeRunner:
    """Records dispatches; mirrors the two client errors `ops.run_command` raises."""

    def __init__(self) -> None:
        self.ran: list[tuple[str, dict[str, Any]]] = []

    async def __call__(self, name: str, args: dict[str, Any]) -> None:
        if name not in ops.COMMANDS:
            raise BadRequest(f"Unknown command: {name}")
        if name == "seed" and not args.get("email"):
            raise BadRequest("seed needs args.email")
        self.ran.append((name, args))


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
    assert runner.ran == [("migrate", {})]


async def test_seed_command_carries_its_args(client: AsyncClient, runner: FakeRunner):
    response = await client.post(
        "/events", json={"command": "seed", "args": {"email": "you@example.com"}}
    )

    assert response.status_code == 200, response.text
    assert response.json() == {"command": "seed", "status": "ok"}
    assert runner.ran == [("seed", {"email": "you@example.com"})]


async def test_seed_without_an_email_is_a_400(client: AsyncClient, runner: FakeRunner):
    response = await client.post("/events", json={"command": "seed"})

    assert response.status_code == 400
    assert runner.ran == []


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


async def test_seed_on_lambda_reaches_the_loader_with_the_email(
    lambda_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    seen: list[str] = []

    async def fake_seed(session_factory: Any, owner_email: str) -> None:
        seen.append(owner_email)

    monkeypatch.setattr(ops, "seed_demo_trips", fake_seed)

    response = await lambda_client.post(
        "/events", json={"command": "seed", "args": {"email": " you@example.com "}}
    )
    app.dependency_overrides.pop(get_settings)

    assert response.status_code == 200, response.text
    assert seen == ["you@example.com"]


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


async def test_run_command_seed_requires_an_email():
    with pytest.raises(BadRequest, match="email"):
        await ops.run_command("seed")
    with pytest.raises(BadRequest, match="email"):
        await ops.run_command("seed", {"email": "   "})


def test_cli_parses_the_seed_form():
    namespace = ops.build_parser().parse_args(["seed", "you@example.com"])
    assert (namespace.command, namespace.email) == ("seed", "you@example.com")

    with pytest.raises(SystemExit):
        ops.build_parser().parse_args(["seed"])
