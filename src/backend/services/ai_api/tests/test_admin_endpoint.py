"""`/api/v1/ai/admin`: the turn traces, the retrieval evaluation and the answer
evaluation's runs, for administrators only."""

import json
import logging
from datetime import UTC, datetime
from typing import Any

import pytest
from ai_api.api.deps import (
    get_eval_answerer,
    get_eval_store,
    get_judge,
    get_retriever,
)
from ai_api.application import judge_validation, retrieval_eval
from ai_api.domain.models import Document
from ai_api.main import app
from ai_api.testing import (
    FakeProvider,
    FakeRetriever,
    InMemoryEvalStore,
    InMemoryTraceLog,
    make_trace,
    settings_for_tests,
)
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


EVAL = f"{BASE}/retrieval-eval"


async def test_the_retrieval_eval_scores_every_city_for_an_admin(
    client: AsyncClient, admin: dict[str, str]
):
    first = retrieval_eval.load_questions("madrid")[0]
    found = Document(id=first.expected[0], content="", metadata={"city": "madrid"})
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever([found])

    response = await client.post(EVAL, headers=admin)

    assert response.status_code == 200
    body = response.json()
    settings = settings_for_tests()
    assert body["index"] == f"{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}"
    assert body["top_k"] == 10
    assert body["overall"]["questions"] == 120
    cities = [s["label"] for s in body["by_city"]]
    assert cities == retrieval_eval.cities_with_questions()
    assert [s["label"] for s in body["by_language"]] == ["en", "es"]
    miss = next(m for m in body["misses"] if m["id"] == first.id)
    assert miss["city"] == "madrid"
    assert miss["expected"][0] == {"doc_id": first.expected[0], "rank": 1}
    assert all(e["rank"] is None for e in miss["expected"][1:])
    assert first.expected[0] not in body["missing_from_index"]


async def test_the_retrieval_eval_is_for_admins_only(
    client: AsyncClient, auth_headers: dict[str, str]
):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever()

    response = await client.post(EVAL, headers=auth_headers)

    assert response.status_code == 403


async def test_the_retrieval_eval_needs_retrieval(
    client: AsyncClient, admin: dict[str, str]
):
    app.dependency_overrides[get_retriever] = lambda: None

    response = await client.post(EVAL, headers=admin)

    assert response.status_code == 503


ANSWER_EVAL = f"{BASE}/answer-eval"

GOLDEN_CASE = judge_validation.Case(
    id="budapest/baths~price",
    city="budapest",
    lang="en",
    query="Which bath?",
    answerable=True,
    passages=("wv:bath",),
    context="Gellért Baths, open 6:00-20:00.",
    answer="The Gellért Baths, 30 EUR.",
    origin="perturbed",
    defect="invented-price",
    expected=judge_validation.Expected(2, 5, False),
    why="The price is not in the passage.",
)

JUDGED = json.dumps(
    {
        "groundedness": 2,
        "relevance": 5,
        "acknowledges_gap": False,
        "unsupported_claims": ["30 EUR"],
        "reason": "Invented price.",
    }
)


@pytest.fixture
def eval_store(monkeypatch: pytest.MonkeyPatch) -> InMemoryEvalStore:
    """A golden set of one case, judged by a fake, kept in memory."""
    monkeypatch.setattr(judge_validation, "load_cases", lambda: [GOLDEN_CASE])
    store = InMemoryEvalStore()
    app.dependency_overrides[get_eval_store] = lambda: store
    app.dependency_overrides[get_judge] = lambda: FakeProvider(replies=[JUDGED])
    app.dependency_overrides[get_eval_answerer] = lambda: None
    app.dependency_overrides[get_retriever] = lambda: None
    return store


def sse(body: str) -> list[dict[str, Any] | str]:
    out: list[dict[str, Any] | str] = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            data = line[6:]
            out.append(data if data == "[DONE]" else json.loads(data))
    return out


async def test_a_golden_run_streams_progress_then_the_stored_report(
    client: AsyncClient, admin: dict[str, str], eval_store: InMemoryEvalStore
):
    response = await client.post(ANSWER_EVAL, json={"set": "golden"}, headers=admin)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = sse(response.text)
    assert events[-1] == "[DONE]"
    progress, report = events[0], events[1]
    assert isinstance(progress, dict) and isinstance(report, dict)
    assert progress["type"] == "progress"
    assert (progress["done"], progress["total"]) == (1, 1)
    assert progress["item"]["verdict"]["unsupported_claims"] == ["30 EUR"]
    assert report["type"] == "report"
    run = report["run"]
    assert run["status"] == "done"
    assert run["agreement"]["groundedness"]["exact"] == 1.0
    assert eval_store.runs[run["run_id"]].status == "done"


async def test_runs_are_listed_and_open_with_their_items(
    client: AsyncClient, admin: dict[str, str], eval_store: InMemoryEvalStore
):
    await client.post(ANSWER_EVAL, json={"set": "golden"}, headers=admin)
    [run_id] = eval_store.runs

    listed = await client.get(f"{BASE}/answer-evals", headers=admin)
    opened = await client.get(f"{BASE}/answer-evals/{run_id}", headers=admin)

    assert [r["run_id"] for r in listed.json()["items"]] == [run_id]
    body = opened.json()
    assert body["run"]["set"] == "golden"
    assert [i["key"] for i in body["items"]] == ["budapest/baths~price"]
    assert body["items"][0]["expected"]["groundedness"] == 2


async def test_a_second_run_while_one_runs_is_a_conflict(
    client: AsyncClient, admin: dict[str, str], eval_store: InMemoryEvalStore
):
    await eval_store.claim("busy", datetime.now(UTC), datetime.now(UTC))

    response = await client.post(ANSWER_EVAL, json={"set": "golden"}, headers=admin)

    assert response.status_code == 409


async def test_a_questions_run_without_retrieval_is_503(
    client: AsyncClient, admin: dict[str, str], eval_store: InMemoryEvalStore
):
    response = await client.post(ANSWER_EVAL, json={"set": "questions"}, headers=admin)

    assert response.status_code == 503


async def test_an_unknown_run_is_404(
    client: AsyncClient, admin: dict[str, str], eval_store: InMemoryEvalStore
):
    response = await client.get(f"{BASE}/answer-evals/nope", headers=admin)

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("method", "url"),
    [
        ("post", ANSWER_EVAL),
        ("get", f"{BASE}/answer-evals"),
        ("get", f"{BASE}/answer-evals/r1"),
    ],
)
async def test_the_answer_eval_routes_are_for_admins_only(
    client: AsyncClient,
    auth_headers: dict[str, str],
    eval_store: InMemoryEvalStore,
    method: str,
    url: str,
):
    response = await client.request(
        method, url, json={"set": "golden"}, headers=auth_headers
    )

    assert response.status_code == 403
    assert eval_store.runs == {}


async def test_starting_a_run_is_audited_as_a_write(
    client: AsyncClient,
    admin: dict[str, str],
    eval_store: InMemoryEvalStore,
    caplog: pytest.LogCaptureFixture,
):
    with caplog.at_level(logging.INFO, logger="ai_api.api.v1.endpoints.admin"):
        await client.post(ANSWER_EVAL, json={"set": "golden"}, headers=admin)
        await client.get(f"{BASE}/answer-evals", headers=admin)

    lines = [
        r.getMessage() for r in caplog.records if "subject=admin-1" in r.getMessage()
    ]
    assert lines == [
        f"admin_write subject=admin-1 route={ANSWER_EVAL} target=-",
        f"admin_read subject=admin-1 route={BASE}/answer-evals target=-",
    ]
