"""The access list and the daily token quota over HTTP (ADR 0026): the
planner and the chat refuse before they stream, `/usage/me`, `/admin/usage`."""

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from ai_api.api.deps import (
    get_access_gateway,
    get_check_access,
    get_retriever,
)
from ai_api.application.access import CheckAccess
from ai_api.config import get_settings
from ai_api.domain.usage import Entitlement
from ai_api.main import app
from ai_api.testing import (
    FakeAccessGateway,
    FakeRetriever,
    InMemoryUsageStore,
    settings_for_tests,
)
from httpx import AsyncClient
from travel_common.exceptions import ProviderUnavailable
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

PLANNER_URL = "/api/v1/ai/planner"
CHAT_URL = "/api/v1/ai/chat"
USAGE_URL = "/api/v1/ai/usage/me"
ADMIN_USAGE_URL = "/api/v1/ai/admin/usage"

TODAY = date(2030, 3, 1)
ENABLED = settings_for_tests().model_copy(update={"ACCESS_CONTROL_ENABLED": True})

TURN = {
    "message": "A weekend in Budapest from Madrid, 2 adults",
    "action": None,
    "history": [],
    "brief": None,
    "itinerary": None,
    "exclude_card_ids": [],
    "trip_id": None,
    "session_id": None,
    "language": "en",
}

DENIED = Entitlement(allowed=False, daily_token_limit=None)


def limited(limit: int | None) -> Entitlement:
    return Entitlement(allowed=True, daily_token_limit=limit)


@pytest.fixture
def gateway() -> FakeAccessGateway:
    return FakeAccessGateway(limited(1000))


@pytest.fixture
def gated(
    client: AsyncClient, gateway: FakeAccessGateway, usage_store: InMemoryUsageStore
) -> Iterator[AsyncClient]:
    """The app with `ACCESS_CONTROL_ENABLED`, a scripted core_api and a
    fixed UTC day."""
    check = CheckAccess(gateway, usage_store, ttl_seconds=0, today=lambda: TODAY)
    app.dependency_overrides[get_settings] = lambda: ENABLED
    app.dependency_overrides[get_access_gateway] = lambda: gateway
    app.dependency_overrides[get_check_access] = lambda: check
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever([])
    yield client


def admin_headers() -> dict[str, str]:
    principal = Principal(subject="admin-1", email="a@example.com", role=Role.ADMIN)
    token = create_access_token(principal, settings_for_tests())
    return {"Authorization": f"Bearer {token}"}


async def spend(usage: InMemoryUsageStore, tokens: int, subject: str = "1") -> None:
    await usage.add(
        subject, TODAY, input_tokens=tokens, output_tokens=0, embed_tokens=0
    )


# ─── The routes that spend tokens ───────────────────────────────────────────


@pytest.mark.parametrize(
    ("url", "body"), [(PLANNER_URL, TURN), (CHAT_URL, {"message": "hola"})]
)
async def test_over_budget_is_a_plain_429_before_any_stream(
    gated: AsyncClient, auth_headers, usage_store: InMemoryUsageStore, url, body
):
    await spend(usage_store, 1000)

    response = await gated.post(url, json=body, headers=auth_headers)

    assert response.status_code == 429
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {
        "detail": {
            "message": "Daily token limit reached",
            "error_code": "DAILY_TOKEN_LIMIT",
            "extras": {
                "limit": 1000,
                "used": 1000,
                "resets_at": "2030-03-02T00:00:00+00:00",
            },
        }
    }


@pytest.mark.parametrize(
    ("method", "url", "body"),
    [
        ("POST", PLANNER_URL, TURN),
        ("POST", CHAT_URL, {"message": "hola"}),
        ("GET", f"{PLANNER_URL}/cities", None),
        ("GET", f"{PLANNER_URL}/card?id=osm:node/1", None),
        ("GET", USAGE_URL, None),
    ],
)
async def test_an_account_off_the_list_is_a_plain_403(
    gated: AsyncClient, auth_headers, gateway: FakeAccessGateway, method, url, body
):
    gateway.entitlement = DENIED

    response = await gated.request(method, url, json=body, headers=auth_headers)

    assert response.status_code == 403
    assert response.headers["content-type"] == "application/json"
    assert response.json()["detail"]["error_code"] == "ACCESS_DENIED"


async def test_core_api_out_of_reach_refuses_the_turn(
    gated: AsyncClient, auth_headers, gateway: FakeAccessGateway
):
    gateway.fail_with = ProviderUnavailable("core_api unreachable")

    response = await gated.post(
        CHAT_URL, json={"message": "hola"}, headers=auth_headers
    )

    assert response.status_code == 503


async def test_the_token_is_checked_before_core_api_is_asked(
    gated: AsyncClient, gateway: FakeAccessGateway
):
    response = await gated.post(CHAT_URL, json={"message": "hola"})

    assert response.status_code == 401
    assert gateway.tokens == []


async def test_under_budget_the_turn_runs_and_is_counted(
    gated: AsyncClient,
    auth_headers,
    gateway: FakeAccessGateway,
    usage_store: InMemoryUsageStore,
):
    response = await gated.post(
        CHAT_URL, json={"message": "hola"}, headers=auth_headers
    )

    assert response.status_code == 200
    assert "Hola" in response.text
    assert gateway.tokens == [auth_headers["Authorization"].removeprefix("Bearer ")]
    # The fake model reports 3 + 2 tokens, on the UTC day the turn ran.
    [counter] = usage_store.days.values()
    assert (counter.subject, counter.tokens, counter.turns) == ("1", 5, 1)
    assert counter.day == datetime.now(UTC).date().isoformat()


async def test_the_turn_that_crosses_the_limit_finishes_and_the_next_is_refused(
    client: AsyncClient,
    auth_headers,
    gateway: FakeAccessGateway,
    usage_store: InMemoryUsageStore,
):
    gateway.entitlement = limited(4)
    app.dependency_overrides[get_settings] = lambda: ENABLED
    app.dependency_overrides[get_access_gateway] = lambda: gateway

    first = await client.post(CHAT_URL, json={"message": "hola"}, headers=auth_headers)
    second = await client.post(CHAT_URL, json={"message": "hola"}, headers=auth_headers)

    assert first.status_code == 200 and "Hola" in first.text
    assert second.status_code == 429
    assert second.json()["detail"]["extras"]["used"] == 5


async def test_planner_within_budget_streams(gated: AsyncClient, auth_headers):
    response = await gated.post(PLANNER_URL, json=TURN, headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")


@pytest.mark.parametrize(
    ("url", "body"), [(PLANNER_URL, TURN), (CHAT_URL, {"message": "hola"})]
)
async def test_access_control_off_asks_nobody_and_limits_nothing(
    client: AsyncClient,
    auth_headers,
    gateway: FakeAccessGateway,
    usage_store: InMemoryUsageStore,
    url,
    body,
):
    gateway.entitlement = DENIED
    app.dependency_overrides[get_access_gateway] = lambda: gateway
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever([])
    await usage_store.add(
        "1",
        datetime.now(UTC).date(),
        input_tokens=10**9,
        output_tokens=0,
        embed_tokens=0,
    )

    response = await client.post(url, json=body, headers=auth_headers)

    assert response.status_code == 200
    assert gateway.tokens == []


# ─── GET /ai/usage/me ───────────────────────────────────────────────────────


async def test_usage_me_reports_today_and_the_limit(
    gated: AsyncClient, auth_headers, usage_store: InMemoryUsageStore
):
    await usage_store.add(
        "1", TODAY, input_tokens=120, output_tokens=30, embed_tokens=9
    )
    await spend(usage_store, 7, subject="someone-else")

    response = await gated.get(USAGE_URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json() == {
        "day": "2030-03-01",
        "used_tokens": 150,
        "input_tokens": 120,
        "output_tokens": 30,
        "turns": 1,
        "daily_token_limit": 1000,
        "resets_at": "2030-03-02T00:00:00Z",
    }


async def test_usage_me_answers_over_the_limit_too(
    gated: AsyncClient, auth_headers, usage_store: InMemoryUsageStore
):
    await spend(usage_store, 5000)

    response = await gated.get(USAGE_URL, headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["used_tokens"] == 5000


async def test_usage_me_without_access_control_has_no_limit(
    client: AsyncClient, auth_headers
):
    response = await client.get(USAGE_URL, headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["daily_token_limit"] is None
    assert (body["used_tokens"], body["turns"]) == (0, 0)
    assert body["day"] == datetime.now(UTC).date().isoformat()


async def test_usage_me_requires_authentication(client: AsyncClient):
    assert (await client.get(USAGE_URL)).status_code == 401


# ─── GET /ai/admin/usage ────────────────────────────────────────────────────


async def test_admin_usage_lists_a_day_most_tokens_first(
    gated: AsyncClient, usage_store: InMemoryUsageStore
):
    await usage_store.add(
        "sub-1", TODAY, input_tokens=10, output_tokens=5, embed_tokens=2
    )
    await usage_store.add(
        "sub-2", TODAY, input_tokens=100, output_tokens=50, embed_tokens=0
    )
    await usage_store.add(
        "sub-3", date(2030, 2, 28), input_tokens=9, output_tokens=9, embed_tokens=0
    )

    today = await gated.get(ADMIN_USAGE_URL, headers=admin_headers())
    before = await gated.get(
        ADMIN_USAGE_URL, params={"day": "2030-02-28"}, headers=admin_headers()
    )

    assert today.status_code == 200
    assert today.json() == {
        "day": "2030-03-01",  # the default: today, UTC
        "items": [
            {
                "subject": "sub-2",
                "input_tokens": 100,
                "output_tokens": 50,
                "embed_tokens": 0,
                "tokens": 150,
                "turns": 1,
            },
            {
                "subject": "sub-1",
                "input_tokens": 10,
                "output_tokens": 5,
                "embed_tokens": 2,
                "tokens": 15,
                "turns": 1,
            },
        ],
    }
    assert [i["subject"] for i in before.json()["items"]] == ["sub-3"]


async def test_admin_usage_is_for_administrators(
    client: AsyncClient, auth_headers, usage_store: InMemoryUsageStore
):
    assert (await client.get(ADMIN_USAGE_URL)).status_code == 401
    assert (await client.get(ADMIN_USAGE_URL, headers=auth_headers)).status_code == 403


async def test_admin_usage_is_not_gated_by_the_list(
    gated: AsyncClient, gateway: FakeAccessGateway
):
    gateway.entitlement = DENIED

    response = await gated.get(ADMIN_USAGE_URL, headers=admin_headers())

    assert response.status_code == 200
    assert gateway.tokens == []


async def test_admin_usage_rejects_a_malformed_day(gated: AsyncClient):
    response = await gated.get(
        ADMIN_USAGE_URL, params={"day": "yesterday"}, headers=admin_headers()
    )

    assert response.status_code == 422
