"""`/api/v1/ai/admin`: the turn traces, for administrators only (TRA-221)."""

import logging
from datetime import UTC, datetime

import pytest
from ai_api.testing import InMemoryTraceLog, make_trace, settings_for_tests
from httpx import AsyncClient
from travel_common.principal import Principal, Role
from travel_common.security import create_access_token

BASE = "/api/v1/ai/admin"

ROUTES = (
    f"{BASE}/turns?day=2026-09-23",
    f"{BASE}/turns/t1",
    f"{BASE}/sessions/sess-1",
    f"{BASE}/stats?start=2026-09-22&end=2026-09-23",
)


def headers(role: Role, subject: str) -> dict[str, str]:
    principal = Principal(subject=subject, email=f"{subject}@example.com", role=role)
    token = create_access_token(principal, settings_for_tests())
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin() -> dict[str, str]:
    return headers(Role.ADMIN, "admin-1")


@pytest.fixture
def seeded(trace_log: InMemoryTraceLog) -> InMemoryTraceLog:
    """Four turns: three on the 23rd (two users, one session), one on the 22nd."""
    trace_log.traces.extend(
        [
            make_trace(
                turn_id="t1",
                ts=datetime(2026, 9, 23, 9, 0, tzinfo=UTC),
                subject="sub-1",
                session_id="sess-1",
            ),
            make_trace(
                turn_id="t2",
                ts=datetime(2026, 9, 23, 11, 0, tzinfo=UTC),
                subject="sub-1",
                session_id="sess-1",
                status="error",
                error_code="SERVICE_UNAVAILABLE",
            ),
            make_trace(
                turn_id="t3",
                ts=datetime(2026, 9, 23, 12, 0, tzinfo=UTC),
                kind="card",
                subject="sub-2",
                session_id=None,
                city="bologna",
            ),
            make_trace(
                turn_id="t4",
                ts=datetime(2026, 9, 22, 8, 0, tzinfo=UTC),
                subject="sub-1",
                session_id="sess-2",
            ),
        ]
    )
    return trace_log


def ids(body: dict) -> list[str]:
    return [item["turn_id"] for item in body["items"]]


@pytest.mark.parametrize("url", ROUTES)
async def test_a_user_who_is_not_admin_gets_403(
    client: AsyncClient, auth_headers: dict[str, str], url: str
):
    response = await client.get(url, headers=auth_headers)

    assert response.status_code == 403


async def test_a_day_lists_newest_first(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(f"{BASE}/turns?day=2026-09-23", headers=admin)

    assert response.status_code == 200
    body = response.json()
    assert ids(body) == ["t3", "t2", "t1"]
    assert body["next_cursor"] is None
    first = body["items"][0]
    assert first["day"] == "2026-09-23" and first["sk"].endswith("#t3")
    assert first["sources"][0]["doc_id"] == "doc-1"


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("kind=card", ["t3"]),
        ("status=error", ["t2"]),
        ("city=budapest", ["t2", "t1"]),
        ("subject=sub-1", ["t2", "t1"]),
    ],
)
async def test_a_day_is_filtered(
    client: AsyncClient,
    admin: dict[str, str],
    seeded: InMemoryTraceLog,
    query: str,
    expected: list[str],
):
    response = await client.get(f"{BASE}/turns?day=2026-09-23&{query}", headers=admin)

    assert ids(response.json()) == expected


async def test_a_cursor_walks_a_day_one_turn_at_a_time(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        url = f"{BASE}/turns?day=2026-09-23&limit=1"
        if cursor:
            url += f"&cursor={cursor}"
        body = (await client.get(url, headers=admin)).json()
        seen.extend(ids(body))
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert seen == ["t3", "t2", "t1"]


async def test_a_user_lists_newest_first(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(f"{BASE}/turns?subject=sub-1", headers=admin)

    assert ids(response.json()) == ["t2", "t1", "t4"]


async def test_a_session_lists_oldest_first(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    by_query = await client.get(f"{BASE}/turns?session=sess-1", headers=admin)
    by_path = await client.get(f"{BASE}/sessions/sess-1", headers=admin)

    assert ids(by_query.json()) == ["t1", "t2"]
    assert ids(by_path.json()) == ["t1", "t2"]


async def test_turns_need_a_day_a_subject_or_a_session(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(f"{BASE}/turns?kind=planner", headers=admin)

    assert response.status_code == 400


async def test_a_malformed_cursor_is_400(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(
        f"{BASE}/turns?day=2026-09-23&cursor=nonsense", headers=admin
    )

    assert response.status_code == 400


async def test_a_turn_opens_whole_with_its_steps_in_order(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(f"{BASE}/turns/t2", headers=admin)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["turn_id"] == "t2"
    assert body["summary"]["error_code"] == "SERVICE_UNAVAILABLE"
    assert [span["seq"] for span in body["spans"]] == [1, 2]
    assert body["spans"][0]["payload"] == {} and body["spans"][0]["results"] == []
    assert body["context"]["message"] == "5 days in Budapest"
    assert body["timeline"] == [
        {"t_ms": 200, "type": "text", "summary": "", "bytes": 12, "count": 1}
    ]


async def test_an_unknown_turn_is_404(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(f"{BASE}/turns/nope", headers=admin)

    assert response.status_code == 404


@pytest.mark.parametrize(
    "query",
    ["start=2026-09-23&end=2026-09-22", "start=2026-08-01&end=2026-09-01"],
)
async def test_stats_refuse_a_backwards_or_longer_than_31_days_range(
    client: AsyncClient, admin: dict[str, str], query: str
):
    response = await client.get(f"{BASE}/stats?{query}", headers=admin)

    assert response.status_code == 400


async def test_stats_count_each_day_and_zero_the_empty_ones(
    client: AsyncClient, admin: dict[str, str], seeded: InMemoryTraceLog
):
    response = await client.get(
        f"{BASE}/stats?start=2026-09-21&end=2026-09-23", headers=admin
    )

    assert response.status_code == 200
    body = response.json()
    days = {day["day"]: day for day in body["days"]}
    assert list(days) == ["2026-09-21", "2026-09-22", "2026-09-23"]
    assert days["2026-09-21"]["turns"] == 0
    assert days["2026-09-21"]["latency_p50_ms"] is None
    assert days["2026-09-22"]["turns"] == 1
    assert days["2026-09-23"]["turns"] == 3
    assert days["2026-09-23"]["errors"] == 1 and days["2026-09-23"]["ok"] == 2
    totals = body["totals"]
    assert totals["turns"] == 4 and totals["subjects"] == 2
    assert totals["sessions"] == 2
    assert body["by_kind"][0] == {
        "kind": "planner",
        "turns": 3,
        "errors": 1,
        "cost_usd": pytest.approx(0.003),
    }
    assert body["top_used"] == [{"doc_id": "doc-1", "title": "Doc 1", "count": 4}]


async def test_every_admin_read_logs_an_audit_line(
    client: AsyncClient,
    admin: dict[str, str],
    seeded: InMemoryTraceLog,
    caplog: pytest.LogCaptureFixture,
):
    with caplog.at_level(logging.INFO, logger="ai_api.api.v1.endpoints.admin"):
        await client.get(f"{BASE}/turns/t1", headers=admin)
        await client.get(f"{BASE}/turns?day=2026-09-23", headers=admin)

    lines = [r.getMessage() for r in caplog.records if "admin_read" in r.getMessage()]
    assert lines == [
        f"admin_read subject=admin-1 route={BASE}/turns/t1 target=t1",
        f"admin_read subject=admin-1 route={BASE}/turns target=-",
    ]
