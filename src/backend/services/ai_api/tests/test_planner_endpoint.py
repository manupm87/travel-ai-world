"""POST /api/v1/ai/planner and GET /api/v1/ai/planner/card — authentication,
the retrieval requirement and the SSE v2 framing end to end."""

import json
from pathlib import Path

from ai_api.api.deps import (
    get_photos,
    get_previews,
    get_retriever,
    get_weather,
)
from ai_api.domain.models import Photo
from ai_api.main import app
from ai_api.testing import (
    FakePhotoFinder,
    FakeProvider,
    FakeRetriever,
    FakeSitePreviews,
    InMemoryTraceLog,
    documents_from_corpus,
)
from httpx import AsyncClient

PLANNER_URL = "/api/v1/ai/planner"
CARD_URL = f"{PLANNER_URL}/card"
FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"
MAZEL_TOV = "osm:node/3990944430"
"""A bar the corpus has no photo of: the lookup asks Commons for one."""

BAR_PHOTO = Photo(url="https://example.org/mazel.jpg", credit="Someone (CC BY-SA 4.0)")
SITE_PHOTO = Photo(url="https://mazeltov.hu/sala.jpg", credit="mazeltov.hu")

EMPTY_TURN = {
    "message": "A weekend in Budapest from Madrid, 2 adults",
    "action": None,
    "history": [],
    "brief": None,
    "itinerary": None,
    "exclude_card_ids": [],
    "trip_id": None,
    "session_id": None,
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


async def test_the_cities_endpoint_lists_the_manifest(
    client: AsyncClient, auth_headers
):
    response = await client.get(f"{PLANNER_URL}/cities", headers=auth_headers)

    assert response.status_code == 200
    [budapest] = [c for c in response.json() if c["slug"] == "budapest"]
    assert budapest["name"] == "Budapest"
    # The country travels with the city: a saved trip names it (TRA-196).
    assert (budapest["country"], budapest["country_code"]) == ("Hungary", "HU")
    assert budapest["centre"] == [47.4979, 19.0402]
    assert budapest["timezone"] == "Europe/Budapest"
    # What the trip overview shows: a description per language and a photo.
    assert sorted(budapest["intro"]) == ["en", "es"]
    assert budapest["intro"]["en"]["text"].startswith("Budapest is the capital")
    assert (
        budapest["intro"]["en"]["source_url"]
        == "https://en.wikivoyage.org/wiki/Budapest"
    )
    assert budapest["image_url"].startswith("https://commons.wikimedia.org/")
    assert budapest["image_credit"].endswith("· Wikimedia Commons")
    assert set(budapest) == {
        "slug",
        "name",
        "country",
        "country_code",
        "centre",
        "timezone",
        "intro",
        "image_url",
        "image_credit",
    }


async def test_the_cities_endpoint_requires_authentication(client: AsyncClient):
    response = await client.get(f"{PLANNER_URL}/cities")

    assert response.status_code == 401


async def test_the_card_endpoint_answers_the_full_detail(
    client: AsyncClient, auth_headers
):
    """The id goes in, the store answers: the client sends no content (TRA-178)."""
    retriever = FakeRetriever(documents_from_corpus(FIXTURE))
    app.dependency_overrides[get_retriever] = lambda: retriever
    app.dependency_overrides[get_photos] = lambda: None
    app.dependency_overrides[get_previews] = lambda: None

    response = await client.get(
        CARD_URL, params={"id": MAZEL_TOV}, headers=auth_headers
    )

    assert response.status_code == 200
    card = response.json()
    assert retriever.fetches == [[MAZEL_TOV]]
    assert card["id"] == MAZEL_TOV
    assert card["title"] == "Mazel Tov"
    assert card["description"].startswith("Mazel Tov — bar in Erzsébetváros")
    assert card["address"] == "Akácfa utca 47, 1073"
    assert card["phone"] == "+36 70 626 4280"
    assert card["website"] == "https://mazeltov.hu/en/"
    assert card["heading_path"] == "Budapest › Erzsébetváros › Drink"  # noqa: RUF001
    # Additive over OptionCard: every card field is still there.
    assert card["category"] == "drink"
    assert card["hours"] == "Mo-Su 12:00-24:00"
    assert card["source"] == "OpenStreetMap"
    # But not a replacement for the streamed card: the model's sentence is not
    # in the store, and with no lookup neither is a photo (never a placeholder).
    assert card["why"] == ""
    assert card["image_url"] is None
    assert card["image_credit"] is None


async def test_the_card_endpoint_pictures_what_the_corpus_does_not(
    client: AsyncClient, auth_headers
):
    """Wired like the planner's cards (TRA-161): the panel of a bar the corpus
    has no photo of is not blank."""
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )
    app.dependency_overrides[get_photos] = lambda: FakePhotoFinder(
        {"Mazel Tov": BAR_PHOTO}
    )
    app.dependency_overrides[get_previews] = lambda: None

    response = await client.get(
        CARD_URL, params={"id": MAZEL_TOV}, headers=auth_headers
    )

    assert response.status_code == 200
    card = response.json()
    assert card["image_url"] == BAR_PHOTO.url
    assert card["image_credit"] == BAR_PHOTO.credit


async def test_the_card_endpoint_falls_back_to_the_venues_own_site(
    client: AsyncClient, auth_headers
):
    """Commons knows no such bar: the image its own site publishes (TRA-206)."""
    site = "https://mazeltov.hu/en/"
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )
    app.dependency_overrides[get_photos] = lambda: FakePhotoFinder()
    app.dependency_overrides[get_previews] = lambda: FakeSitePreviews(
        {site: SITE_PHOTO}
    )

    response = await client.get(
        CARD_URL, params={"id": MAZEL_TOV}, headers=auth_headers
    )

    assert response.status_code == 200
    card = response.json()
    assert card["image_url"] == SITE_PHOTO.url
    assert card["image_credit"] == "mazeltov.hu"


async def test_an_unknown_card_id_is_a_404(client: AsyncClient, auth_headers):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )
    app.dependency_overrides[get_photos] = lambda: None
    app.dependency_overrides[get_previews] = lambda: None

    response = await client.get(
        CARD_URL, params={"id": "osm:node/made-up"}, headers=auth_headers
    )

    assert response.status_code == 404
    assert response.json()["detail"]["error_code"] == "NOT_FOUND"


async def test_the_card_endpoint_requires_authentication(client: AsyncClient):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )

    response = await client.get(CARD_URL, params={"id": MAZEL_TOV})

    assert response.status_code == 401


async def test_the_card_endpoint_needs_an_id(client: AsyncClient, auth_headers):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever()

    response = await client.get(CARD_URL, headers=auth_headers)

    assert response.status_code == 422


async def test_without_retrieval_there_is_no_card_detail(
    client: AsyncClient, auth_headers
):
    """Same mapping as the planner itself: no store, 503 (unchanged by TRA-178)."""
    response = await client.get(
        CARD_URL, params={"id": MAZEL_TOV}, headers=auth_headers
    )

    assert response.status_code == 503
    assert response.json()["detail"]["error_code"] == "SERVICE_UNAVAILABLE"


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
    streamed = events_of(response.text)
    # The progress goes between the other events (TRA-242): checked on its own.
    progress = [e for e in streamed if isinstance(e, dict) and e["type"] == "progress"]
    assert [e["step"] for e in progress] == ["open", "list", "zip"]
    assert progress[0] == streamed[0]
    assert progress[1]["detail"]
    assert all(e["sources"] == [] for e in progress)
    events = [
        e for e in streamed if not (isinstance(e, dict) and e["type"] == "progress")
    ]
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


SESSION = "7d1f2a4e-3b5c-4d6e-8f90-a1b2c3d4e5f6"
ASTORIA = "wv:en:Budapest/Belváros#sleep:danubius-hotel-astoria"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
ANNA_CAFE = "wv:en:Budapest/Belváros#eat:anna-cafe"
SZIMPLA = "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi"
ONE_DAY = {
    "destination": "Budapest",
    "origin": "Madrid",
    "start_date": "2026-10-20",
    "end_date": "2026-10-20",
    "nights": 0,
    "adults": 2,
    "children": 0,
    "budget_tier": 2,
    "interests": ["history"],
    "pace": "balanced",
}


async def test_a_draft_turn_leaves_one_trace_with_its_steps(
    client: AsyncClient,
    auth_headers,
    provider: FakeProvider,
    trace_log: InMemoryTraceLog,
):
    """ADR 0024: the turn's retrievals, model calls and events are traced."""
    provider.replies = [
        json.dumps(
            {"days": [{"day": 1, "title": "Old town", "districts": [], "theme": ""}]}
        ),
        json.dumps(
            {
                "morning": [
                    {"id": PARLIAMENT, "why": "The landmark."},
                    {"id": "wv:made-up", "why": "Invented."},
                ],
                "afternoon": [],
                "evening": [{"id": ANNA_CAFE, "why": "Close by."}],
                "night": [{"id": SZIMPLA, "why": "The ruin bar."}],
            }
        ),
    ]
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )
    app.dependency_overrides[get_photos] = lambda: None
    app.dependency_overrides[get_previews] = lambda: None
    app.dependency_overrides[get_weather] = lambda: None
    select = EMPTY_TURN | {
        "message": None,
        "action": {
            "type": "select",
            "group_id": "hotels:Belváros",
            "card_ids": [ASTORIA],
            "slot": None,
        },
        "brief": ONE_DAY,
        "session_id": SESSION,
    }

    response = await client.post(PLANNER_URL, json=select, headers=auth_headers)

    assert response.status_code == 200
    assert events_of(response.text)[-1] == "[DONE]"
    [trace] = trace_log.traces
    assert trace.kind == "planner" and trace.status == "ok"
    assert trace.route == PLANNER_URL and trace.subject == "1"
    assert trace.session_id == SESSION and trace.trip_id is None
    assert trace.action == "select:hotels:Belváros"
    assert trace.city == "budapest" and trace.language == "en"
    assert trace.events["itinerary_patch"] > 0
    assert trace.ops["put_activity"] >= 3
    # Retrievals: the selection's fetch and the day's searches, with results.
    searches = [s for s in trace.spans if s.kind == "retriever"]
    assert {s.payload["purpose"] for s in searches} >= {
        "fetch",
        "candidates:1:morning",
        "candidates:1:evening",
    }
    assert all(s.results for s in searches if s.payload["purpose"] != "climate")
    used = {r.doc_id for s in searches for r in s.results if r.used}
    assert {ASTORIA, PARLIAMENT, ANNA_CAFE, SZIMPLA} <= used
    assert trace.docs_used >= 4
    # Model calls: tokens from the fake provider, the invented id dropped.
    llm = [s for s in trace.spans if s.kind == "llm"]
    assert [s.name for s in llm] == ["skeleton", "day_picks:1"]
    assert all(s.payload["input_tokens"] == 3 for s in llm)
    assert llm[1].payload["dropped_ids"] == ["wv:made-up"]
    assert PARLIAMENT in llm[1].payload["picked_ids"]
    assert trace.llm_calls == 2 and trace.input_tokens == 6
    assert trace.dropped_ids == 1
    # Phases in the order the draft runs them.
    phases = [s.phase for s in trace.spans]
    assert phases[0] == "open" and "fold" in phases and "weigh" in phases
    assert {s.name for s in trace.spans} >= {"read_turn", "photos", "validate_day"}
    assert trace.context.brief is not None
    assert trace.timeline[-1].type == "text"


async def test_a_trace_that_cannot_be_written_never_breaks_the_turn(
    client: AsyncClient,
    auth_headers,
    provider: FakeProvider,
    trace_log: InMemoryTraceLog,
):
    trace_log.fail_with = RuntimeError("DynamoDB is down")
    provider.replies = [json.dumps({"destination": "Budapest"})]
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )

    response = await client.post(PLANNER_URL, json=EMPTY_TURN, headers=auth_headers)

    assert response.status_code == 200
    assert events_of(response.text)[-1] == "[DONE]"
    assert trace_log.traces == []


async def test_a_store_failure_is_traced_as_an_error(
    client: AsyncClient,
    auth_headers,
    provider: FakeProvider,
    trace_log: InMemoryTraceLog,
):
    from travel_common.exceptions import ProviderUnavailable

    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        fail_with=ProviderUnavailable("Vector store error")
    )
    brief = dict(ONE_DAY, end_date="2026-10-22", nights=2)

    await client.post(
        PLANNER_URL, json=EMPTY_TURN | {"brief": brief}, headers=auth_headers
    )

    [trace] = trace_log.traces
    assert trace.status == "error" and trace.error_code == "SERVICE_UNAVAILABLE"
    assert any(s.level == "error" for s in trace.spans)


async def test_the_card_endpoint_leaves_a_trace(
    client: AsyncClient, auth_headers, trace_log: InMemoryTraceLog
):
    app.dependency_overrides[get_retriever] = lambda: FakeRetriever(
        documents_from_corpus(FIXTURE)
    )
    app.dependency_overrides[get_photos] = lambda: None
    app.dependency_overrides[get_previews] = lambda: None

    await client.get(CARD_URL, params={"id": MAZEL_TOV}, headers=auth_headers)
    await client.get(CARD_URL, params={"id": "osm:node/nope"}, headers=auth_headers)

    ok, missing = trace_log.traces
    assert ok.kind == "card" and ok.status == "ok" and ok.city == "budapest"
    [fetch] = [s for s in ok.spans if s.kind == "retriever"]
    assert fetch.payload["purpose"] == "fetch" and fetch.results[0].used
    assert missing.status == "error" and missing.error_code == "NOT_FOUND"
