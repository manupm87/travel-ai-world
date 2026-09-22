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

COUNTS = {"users": 2, "trips": 3, "threads": 1, "messages": 4}


class FakeRunner:
    """Records dispatches; mirrors the client error `ops.run_command` raises."""

    def __init__(self) -> None:
        self.ran: list[tuple[str, dict[str, Any]]] = []

    async def __call__(self, name: str, args: dict[str, Any]) -> dict[str, int]:
        if name not in ops.COMMANDS:
            raise BadRequest(f"Unknown command: {name}")
        self.ran.append((name, args))
        return COUNTS


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


async def test_the_copy_is_dispatched_and_answers_its_counts(
    client: AsyncClient, runner: FakeRunner
):
    response = await client.post("/events", json={"command": "copy-from-postgres"})

    assert response.status_code == 200, response.text
    assert response.json() == {
        "command": "copy-from-postgres",
        "status": "ok",
        "result": COUNTS,
    }
    assert runner.ran == [("copy-from-postgres", {})]


async def test_unknown_command_is_a_400(client: AsyncClient, runner: FakeRunner):
    response = await client.post("/events", json={"command": "migrate"})

    assert response.status_code == 400
    assert runner.ran == []


async def test_events_is_not_under_the_versioned_api(client: AsyncClient):
    assert (
        await client.post("/api/v1/events", json={"command": "copy-from-postgres"})
    ).status_code == 404


async def test_events_only_exists_on_lambda(
    client: AsyncClient, lambda_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    calls: list[dict[str, Any]] = []

    async def fake_copy(args: dict[str, Any]) -> dict[str, int]:
        calls.append(args)
        return COUNTS

    monkeypatch.setitem(ops.COMMANDS, "copy-from-postgres", fake_copy)

    on_lambda = await lambda_client.post(
        "/events", json={"command": "copy-from-postgres"}
    )

    assert on_lambda.status_code == 200, on_lambda.text
    assert on_lambda.json()["result"] == COUNTS
    assert calls == [{}]

    app.dependency_overrides.pop(get_settings)
    elsewhere = await client.post("/events", json={"command": "copy-from-postgres"})

    assert elsewhere.status_code == 404
    assert calls == [{}]


async def test_run_command_rejects_unknown_names():
    with pytest.raises(BadRequest):
        await ops.run_command("nope")


def test_the_copy_is_the_whole_command_surface():
    """`POST /events` exposes exactly what `COMMANDS` holds, so the list is
    the security boundary (`devtools` is deliberately not in it, and there
    are no migrations any more: ADR 0023)."""
    assert sorted(ops.COMMANDS) == ["copy-from-postgres"]


def test_cli_parses_the_copy_form():
    assert (
        ops.build_parser().parse_args(["copy-from-postgres"]).command
        == "copy-from-postgres"
    )

    with pytest.raises(SystemExit):
        ops.build_parser().parse_args([])
    with pytest.raises(SystemExit):
        ops.build_parser().parse_args(["migrate"])
