import json
from pathlib import Path

import httpx
import pytest
from city_corpus import build
from city_corpus.build import (
    BuildResult,
    CorpusValidationError,
    Stage,
    _resolve_photos,
    collect,
    validate,
    write,
)
from city_corpus.config.cities import BUDAPEST
from city_corpus.http import ApiClient, CacheMiss, Fetched
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import photos

TEXT = "A document text that is long enough to pass validation."


def _doc(**overrides: object) -> CorpusDocument:
    fields: dict[str, object] = {
        "doc_id": "wv:en:Budapest#see:x",
        "city": "budapest",
        "category": Category.SEE,
        "kind": Kind.LISTING,
        "text": TEXT,
        "heading_path": "Budapest › See",
        "source": Source.WIKIVOYAGE,
        "source_url": "https://en.wikivoyage.org/wiki/Budapest#See",
        "lang": "en",
        "lat": 47.5,
        "lon": 19.05,
    }
    return CorpusDocument.model_validate({**fields, **overrides})


def test_valid_documents_pass() -> None:
    assert validate([_doc(), _doc(doc_id="other")], BUDAPEST) == []


@pytest.mark.parametrize(
    ("docs", "problem"),
    [
        ([_doc(), _doc()], "duplicate doc_id"),
        ([_doc(doc_id=" ")], "empty doc_id"),
        ([_doc(text="too short")], "shorter than 40"),
        ([_doc(city="madrid")], "is not 'budapest'"),
        ([_doc(lon=None)], "both set or both null"),
        ([_doc(lat=40.4, lon=-3.7)], "outside the city bbox"),
        ([_doc(price_tier=4)], "price_tier"),
    ],
)
def test_validation_failures(docs: list[CorpusDocument], problem: str) -> None:
    problems = validate(docs, BUDAPEST)
    assert any(problem in p for p in problems), problems


def test_write_refuses_invalid_corpus(tmp_path: Path) -> None:
    with pytest.raises(CorpusValidationError):
        write(tmp_path, BUDAPEST, BuildResult(documents=[_doc(text="")]))
    assert not (tmp_path / "documents.jsonl").exists()


def test_write_is_deterministic(tmp_path: Path) -> None:
    result = BuildResult(
        documents=[_doc(), _doc(doc_id="b", lat=None, lon=None, alt="Alt")],
        revisions={"wikivoyage:en:Budapest": 7},
        fetched_at=["2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z"],
    )
    write(tmp_path / "one", BUDAPEST, result)
    write(tmp_path / "two", BUDAPEST, result)
    for name in ("documents.jsonl", "manifest.json"):
        assert (tmp_path / "one" / name).read_bytes() == (
            tmp_path / "two" / name
        ).read_bytes()

    lines = (tmp_path / "one" / "documents.jsonl").read_text().splitlines()
    first, second = (json.loads(line) for line in lines)
    assert first["image_url"] is None  # payload fields are always present
    assert "alt" not in first and second["alt"] == "Alt"  # extras only when set

    manifest = json.loads((tmp_path / "one" / "manifest.json").read_text())
    assert manifest["built_at"] == "2026-09-17T11:00:00Z"
    assert manifest["listings_with_coordinates"] == 1
    assert manifest["revisions"] == {"wikivoyage:en:Budapest": 7}


def test_the_photo_stage_runs_after_wikidata_and_before_climate(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It must see the Commons images Wikidata found, and the districts the
    boundaries assigned, before it decides a hotel has no picture (TRA-208).

    The enum's order is not the build's: `collect` calls the stages by hand,
    so the run itself is what is asserted.
    """
    order: list[str] = []

    def record(name: str, answer: object = None):
        def run(*args: object, **kwargs: object) -> object:
            order.append(name)
            return answer

        return run

    monkeypatch.setattr(build, "_collect_osm", record("openstreetmap", "a locator"))
    monkeypatch.setattr(build, "_enrich_wikidata", record("wikidata"))
    monkeypatch.setattr(build, "_assign_districts", record("districts"))
    monkeypatch.setattr(build, "_resolve_photos", record("photos"))
    monkeypatch.setattr(
        build.climate, "fetch", record("climate", Fetched(data={}, fetched_at="2026"))
    )
    monkeypatch.setattr(build.climate, "aggregate", lambda data: [])
    monkeypatch.setattr(build.climate, "documents", lambda rows, city: [])

    collect(
        BUDAPEST,
        ApiClient(tmp_path),
        stages=(Stage.OPENSTREETMAP, Stage.WIKIDATA, Stage.PHOTOS, Stage.CLIMATE),
    )

    assert order == ["openstreetmap", "wikidata", "districts", "photos", "climate"]


def test_the_photo_stage_counters_reach_the_manifest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    hotel = _doc(doc_id="osm:way/1", category=Category.SLEEP, name="Hotel Gellért")
    blind = _doc(doc_id="osm:way/2", category=Category.SLEEP, name="Hotel Astra")
    counters = photos.PhotoStats(site=1, dropped=1, dropped_names=["Hotel Astra"])
    monkeypatch.setattr(
        photos,
        "resolve",
        lambda client, city, documents, curated: ([hotel], counters),
    )
    result = BuildResult(documents=[hotel, blind])

    _resolve_photos(BUDAPEST, ApiClient(tmp_path), result, tmp_path / "curated")
    info = write(tmp_path / "out", BUDAPEST, result)

    assert result.documents == [hotel]
    assert info["enrichment"]["photos"] == {
        "curated": 0,
        "site": 1,
        "facebook": 0,
        "commons": 0,
        "wikidata": 0,
        "page": 0,
        "dropped": 1,
        "shared": 0,
        "dropped_examples": ["Hotel Astra"],
        "notable_without_photo": [],
    }


def test_a_refused_url_is_never_requested(tmp_path: Path) -> None:
    """`hop_allowed` judges the URL it is handed, not only the redirects after
    it: a hotel's `website` tag can name the loopback interface or a cloud
    host's metadata service, and the first hop is a hop too (TRA-208)."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(200, text="whatever answers there")

    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(handler), sleep=lambda _: None
    )

    head = client.head("https://127.0.0.1:8001/x", hop_allowed=lambda _: False)
    page = client.get_text("http://169.254.169.254/latest/meta-data/", lambda _: False)

    assert seen == []
    assert (head.status, page.status) == (0, 0)
    assert page.text == "" and not page.is_html


def test_a_refused_url_is_a_cached_miss(tmp_path: Path) -> None:
    """Cached like any other miss, so `--offline` answers it the same way."""
    client = ApiClient(tmp_path, sleep=lambda _: None)
    client.get_text("https://parked.example/", lambda _: False)

    offline = ApiClient(tmp_path, offline=True, sleep=lambda _: None)
    assert offline.get_text("https://parked.example/", lambda _: False).status == 0


def test_client_caches_and_retries(tmp_path: Path) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return httpx.Response(503)
        if len(calls) == 2:
            return httpx.Response(200, json={"error": {"code": "maxlag"}})
        return httpx.Response(200, json={"query": {"ok": True}})

    url = "https://en.wikivoyage.org/w/api.php"
    params: dict[str, str | int] = {"action": "query", "titles": "Budapest"}
    online = ApiClient(
        tmp_path, transport=httpx.MockTransport(handler), sleep=lambda _: None
    )
    assert online.get(url, params).data == {"query": {"ok": True}}
    assert online.get(url, params).data == {"query": {"ok": True}}
    assert len(calls) == 3
    assert "TravelAIWorld-city-corpus" in calls[0].headers["User-Agent"]
    assert calls[0].url.params["maxlag"] == "5"

    offline = ApiClient(tmp_path, offline=True)
    assert offline.get(url, params).data == {"query": {"ok": True}}
    with pytest.raises(CacheMiss):
        offline.get(url, {"action": "query", "titles": "Pest"})


@pytest.mark.parametrize(
    "code",
    [
        "cirrussearch-too-busy-error",
        "readonly",
        "internal_api_error_DBQueryError",
    ],
    ids=["search-busy", "read-only", "internal"],
)
def test_a_search_backend_that_is_too_busy_is_asked_again(
    tmp_path: Path, code: str
) -> None:
    """These codes mean "not now", not "never": Wikimedia's search sheds load under
    pressure, the database goes read-only, the API throws. Giving up would cost the
    photo stage a source and leave nothing in the cache, so two builds would differ
    (TRA-211). `internal_api_error` arrives with the exception class appended."""
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            error = {"code": code, "info": "not now"}
            return httpx.Response(200, json={"error": error})
        return httpx.Response(200, json={"search": [{"id": "Q42"}]})

    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(handler), sleep=lambda _: None
    )
    url = "https://www.wikidata.org/w/api.php"
    params: dict[str, str | int] = {"action": "wbsearchentities", "search": "hilton"}

    assert client.get(url, params).data == {"search": [{"id": "Q42"}]}
    assert len(calls) == 2


def test_an_api_error_that_is_not_the_backend_being_busy_still_raises(
    tmp_path: Path,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"error": {"code": "badvalue"}})

    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(handler), sleep=lambda _: None
    )
    with pytest.raises(RuntimeError, match="API error"):
        client.get("https://www.wikidata.org/w/api.php", {"action": "wbgetentities"})


def test_query_service_lag_does_not_hold_a_read(tmp_path: Path) -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if "maxlag" in request.url.params:
            error = {"code": "maxlag", "type": "wikibase-queryservice", "lag": 154}
            return httpx.Response(200, json={"error": error})
        return httpx.Response(200, json={"search": []})

    slept: list[float] = []
    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(handler), sleep=slept.append
    )
    url = "https://www.wikidata.org/w/api.php"
    params: dict[str, str | int] = {"action": "wbsearchentities", "search": "x"}
    assert client.get(url, params).data == {"search": []}
    assert len(calls) == 2 and "maxlag" not in calls[1].url.params
    assert all(s < 1 for s in slept)  # the polite pause only, no backoff
