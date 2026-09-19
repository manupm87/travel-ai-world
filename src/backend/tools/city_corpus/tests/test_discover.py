"""`discover` against recorded answers (no network)."""

import json
import tomllib
from pathlib import Path
from typing import Any

import httpx
import pytest
from city_corpus import discover as module
from city_corpus.config.cities import load_city
from city_corpus.discover import (
    DiscoveryError,
    discover,
    render,
    summary,
    write_draft,
)
from city_corpus.http import ApiClient


def _item(qid: str, *, city: bool = True, **extra: Any) -> dict[str, Any]:
    def statement(value: Any, rank: str = "normal") -> dict[str, Any]:
        return {"rank": rank, "mainsnak": {"datavalue": {"value": value}}}

    claims: dict[str, Any] = {
        "P625": [statement({"latitude": 44.4939, "longitude": 11.3428})],
        "P17": [statement({"id": "Q38"})],
        "P31": [statement({"id": "Q747074" if city else "Q5"})],
    }
    claims.update(extra)
    return {
        "id": qid,
        "labels": {
            "en": {"language": "en", "value": "Bologna"},
            "es": {"language": "es", "value": "Bolonia"},
        },
        "sitelinks": {
            "enwikivoyage": {"site": "enwikivoyage", "title": "Bologna"},
            "eswikivoyage": {"site": "eswikivoyage", "title": "Bolonia"},
        },
        "claims": claims,
    }


def _statement(value: Any) -> dict[str, Any]:
    return {"rank": "normal", "mainsnak": {"datavalue": {"value": value}}}


CITY = _item(
    "Q1891",
    P150=[_statement({"id": "Q3927195"}), _statement({"id": "Q3927199"})],
    P402=[_statement("43172")],
)
FAMILY_NAME = {"id": "Q15111371", "labels": {}, "claims": {}}
DISTRICT_LABELS = {
    "Q3927195": {"labels": {"en": {"value": "Santo Stefano"}}},
    "Q3927199": {"labels": {"it": {"value": "Savena"}}},
}


class Answers:
    """Answers each request by URL and parameters; records what was asked."""

    def __init__(self, *, subpages: bool = False, overpass: bool = True) -> None:
        self.subpages = subpages
        self.overpass = overpass
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        params = dict(request.url.params)
        host = request.url.host
        if host == "www.wikidata.org" and params["action"] == "wbsearchentities":
            return httpx.Response(
                200,
                json={"search": [{"id": "Q15111371"}, {"id": "Q1891"}]},
            )
        if host == "www.wikidata.org" and params.get("props") == "labels":
            return httpx.Response(200, json={"entities": DISTRICT_LABELS})
        if host == "www.wikidata.org":
            return httpx.Response(
                200, json={"entities": {"Q15111371": FAMILY_NAME, "Q1891": CITY}}
            )
        if host == "api.open-meteo.com":
            return httpx.Response(200, json={"timezone": "Europe/Rome"})
        if host == "nominatim.openstreetmap.org":
            assert params["osm_ids"] == "R43172"
            return httpx.Response(
                200,
                json=[
                    {
                        "boundingbox": [
                            "44.4210532",
                            "44.5560940",
                            "11.2296206",
                            "11.4334471",
                        ]
                    }
                ],
            )
        if host == "overpass-api.de":
            elements = [
                {
                    "type": "relation",
                    "tags": {"admin_level": "10", "name": "Santo Stefano"},
                },
                {"type": "relation", "tags": {"admin_level": "10", "name": "Savena"}},
                {"type": "relation", "tags": {"admin_level": "9", "name": "Centro"}},
                {"type": "relation", "tags": {"admin_level": "10"}},  # nameless
            ]
            return httpx.Response(
                200, json={"elements": elements if self.overpass else []}
            )
        if host.endswith("wikivoyage.org"):
            root = params["apprefix"]
            pages = [root]
            if self.subpages and host.startswith("en."):
                pages += [f"{root}/Santo Stefano quarter", f"{root}/Bolognina"]
            return httpx.Response(
                200, json={"query": {"allpages": [{"title": t} for t in pages]}}
            )
        if host == "en.wikipedia.org":
            titles = params["titles"].split("|")
            pages = []
            for title in titles:
                if "Museums" in title or "Palaces" in title:
                    pages.append({"title": title, "categoryinfo": {"pages": 17}})
                elif "Buildings" in title:
                    pages.append({"title": title, "categoryinfo": {"pages": 21}})
                elif "Towers" in title:
                    pages.append({"title": title, "categoryinfo": {"pages": 0}})
                else:
                    pages.append({"title": title, "missing": True})
            return httpx.Response(200, json={"query": {"pages": pages}})
        raise AssertionError(f"unexpected request {request.url}")


def _client(tmp_path: Path, answers: Answers) -> ApiClient:
    return ApiClient(
        tmp_path / "cache", transport=httpx.MockTransport(answers), sleep=lambda _: None
    )


def test_discover_drafts_a_loadable_city(tmp_path: Path) -> None:
    answers = Answers()
    with _client(tmp_path, answers) as client:
        found = discover(client, "Bologna")

    assert found.qid == "Q1891"  # the family name, listed first, is not located
    assert found.slug == "bologna"
    assert found.aliases == ("bologna", "bolonia")
    assert found.centre == (44.4939, 11.3428)
    assert found.timezone == "Europe/Rome"
    assert found.bbox == (44.42, 11.22, 44.56, 11.44)
    assert [d.label for d in found.districts] == ["Santo Stefano", "Savena"]
    assert found.districts[1].review is True  # Italian label only
    assert found.admin_level == 10  # the level whose names match Wikidata's
    assert [b.ref for b in found.boundaries] == ["Santo Stefano", "Savena"]
    assert [(g.lang, g.root, g.subpages) for g in found.guides] == [
        ("en", "Bologna", ()),
        ("es", "Bolonia", ()),
    ]
    assert [(c.name, c.pages) for c in found.categories] == [
        ("Museums in Bologna", 17),
        ("Buildings and structures in Bologna", 21),
        ("Palaces in Bologna", 17),
    ]
    assert found.notes == []

    path = write_draft(found, tmp_path / "cities")
    assert path.name == "bologna.draft.toml"
    text = path.read_text(encoding="utf-8")
    data = tomllib.loads(text)
    assert data["districts"] == ["Santo Stefano", "Savena"]
    assert data["district_guides"] == {
        "Santo Stefano": ["Santo Stefano"],
        "Savena": ["Savena"],
    }
    assert data["wikivoyage"][0] == {
        "lang": "en",
        "root": "Bologna",
        "include_subpages": False,
    }
    assert data["wikipedia"]["categories"][1] == {
        "name": "Buildings and structures in Bologna",
        "require_coordinates": True,
    }
    assert "# 21 pages" in text
    assert "# review:" not in text  # the header explains the mark; nothing carries it

    renamed = path.with_name("bologna.toml")
    renamed.write_text(text, encoding="utf-8")
    city = load_city(renamed)
    assert city.slug == "bologna" and city.district_admin_level == 10
    assert "6 OSM" not in summary(found) and "2 OSM boundaries" in summary(found)


def test_district_pages_map_boundaries_to_guides(tmp_path: Path) -> None:
    with _client(tmp_path, Answers(subpages=True)) as client:
        found = discover(client, "Bologna")
    assert found.guides[0].subpages == ("Bolognina", "Santo Stefano quarter")
    data = tomllib.loads(render(found))
    assert data["wikivoyage"][0]["include_subpages"] is True
    assert data["districts"] == ["Bolognina", "Santo Stefano quarter"]
    assert data["district_guides"]["Santo Stefano"] == ["Santo Stefano quarter"]
    assert data["district_guides"]["Savena"] == []
    assert "# review: no guide like 'Savena'" in render(found)


def test_without_boundaries_wikidata_districts_stand_in(tmp_path: Path) -> None:
    with _client(tmp_path, Answers(overpass=False)) as client:
        found = discover(client, "Bologna")
    assert found.admin_level is None
    assert "no district boundaries" in found.notes[0]
    text = render(found)
    assert "district_admin_level = 9  # review" in text
    assert '"Savena" = ["Savena"]  # review: no OSM boundary found' in text


def test_unknown_city_is_an_error(tmp_path: Path) -> None:
    def nothing(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"search": []})

    client = ApiClient(tmp_path, transport=httpx.MockTransport(nothing))
    with pytest.raises(DiscoveryError, match="no item labelled"):
        discover(client, "Nowhere")


def test_bbox_falls_back_to_a_square(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(module, "fetch_bbox", lambda client, relation: None)
    with _client(tmp_path, Answers()) as client:
        found = discover(client, "Bologna")
    assert found.bbox == (44.34, 11.19, 44.64, 11.49)
    assert any("square around the centre" in note for note in found.notes)
    assert "# review: bbox is a square" in render(found)


def test_rendered_strings_are_escaped() -> None:
    assert module._quote('Say "hi" \\ there') == '"Say \\"hi\\" \\\\ there"'
    assert json.loads(module._quote('a"b')) == 'a"b'
