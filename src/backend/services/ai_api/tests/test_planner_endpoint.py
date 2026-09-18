"""POST /api/v1/ai/planner — authentication, the retrieval requirement and
the SSE v2 framing end to end."""

import json
from pathlib import Path

from ai_api.api.deps import get_retriever
from ai_api.main import app
from ai_api.testing import FakeProvider, FakeRetriever, documents_from_corpus
from httpx import AsyncClient

PLANNER_URL = "/api/v1/ai/planner"
FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"

EMPTY_TURN = {
    "message": "A weekend in Budapest from Madrid, 2 adults",
    "action": None,
    "history": [],
    "brief": None,
    "itinerary": None,
    "trip_id": None,
}


def events_of(body: str) -> list[dict | str]:
    out: list[dict | str] = []
    for line in body.split("\n"):
        if line.startswith("data: "):
            data = line[6:]
            out.append(data if data == "[DONE]" else json.loads(data))
    return out


async def test_requires_authentication(client: AsyncClient):
    response = await client.post(PLANNER_URL, json=EMPTY_TURN)

    assert response.status_code == 401


async def test_without_retrieval_the_planner_is_unavailable(
    client: AsyncClient, auth_headers
):
    """Every card is a corpus document: no store, no planner (503 before streaming)."""
    response = await client.post(PLANNER_URL, json=EMPTY_TURN, headers=auth_headers)

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"


async def test_rejects_an_unknown_action(client: AsyncClient, auth_headers):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever()

    response = await client.post(
        PLANNER_URL,
        json=EMPTY_TURN | {"action": {"type": "shuffle"}},
        headers=auth_headers,
    )

    assert response.status_code == 422


async def test_streams_typed_events_and_ends_with_done(
    client: AsyncClient, auth_headers, provider: FakeProvider
):
    provider.replies = [json.dumps({"destination": "Budapest", "origin": "Madrid"})]
    provider.deltas = ["Which ", "dates?"]
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )

    response = await client.post(PLANNER_URL, json=EMPTY_TURN, headers=auth_headers)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = events_of(response.text)
    assert events[0] == {
        "type": "brief",
        "brief": {
            "destination": "Budapest",
            "origin": "Madrid",
            "start_date": None,
            "end_date": None,
            "nights": None,
            "adults": None,
            "children": None,
            "budget_tier": None,
            "interests": [],
            "pace": None,
        },
        "missing": ["dates", "travellers", "interests"],
    }
    assert events[1:3] == [
        {"type": "text", "delta": "Which "},
        {"type": "text", "delta": "dates?"},
    ]
    assert events[-1] == "[DONE]"


async def test_a_store_failure_becomes_an_in_stream_error(
    client: AsyncClient, auth_headers, provider: FakeProvider
):
    from travel_common.exceptions import ProviderUnavailable

    provider.replies = [json.dumps({})]
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        fail_with=ProviderUnavailable("Vector store error")
    )
    complete = EMPTY_TURN | {
        "brief": {
            "destination": "Budapest",
            "origin": "Madrid",
            "start_date": "2026-10-20",
            "end_date": "2026-10-24",
            "nights": 4,
            "adults": 2,
            "children": 0,
            "budget_tier": 2,
            "interests": ["food"],
            "pace": "balanced",
        }
    }

    response = await client.post(PLANNER_URL, json=complete, headers=auth_headers)

    assert response.status_code == 200
    events = events_of(response.text)
    assert events[-2] == {
        "type": "error",
        "error": "Vector store error",
        "error_code": "SERVICE_UNAVAILABLE",
    }
    assert events[-1] == "[DONE]"
