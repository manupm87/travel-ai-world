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

HERO_FILE = "Bologna Panorama.jpg"
HERO_AUTHOR = "Ввласенко"


def _item(
    qid: str, *, city: bool = True, image: bool = True, **extra: Any
) -> dict[str, Any]:
    def statement(value: Any, rank: str = "normal") -> dict[str, Any]:
        return {"rank": rank, "mainsnak": {"datavalue": {"value": value}}}

    claims: dict[str, Any] = {
        "P625": [statement({"latitude": 44.4939, "longitude": 11.3428})],
        "P17": [statement({"id": "Q38"})],
        "P31": [statement({"id": "Q747074" if city else "Q5"})],
    }
    if image:
        # A normal claim and a preferred one: the preferred file is the hero.
        claims["P18"] = [
            statement("Bologna skyline at dusk.jpg"),
            statement(HERO_FILE, rank="preferred"),
        ]
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

    def __init__(
        self,
        *,
        subpages: bool = False,
        overpass: bool = True,
        city: dict[str, Any] = CITY,
        wiki: bool = True,
        licence: str = "CC BY-SA 3.0",
    ) -> None:
        self.subpages = subpages
        self.overpass = overpass
        self.city = city
        self.wiki = wiki  # Wikivoyage articles and Wikipedia categories exist
        self.licence = licence  # what Commons says about the city's P18 file
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
            asked = params["ids"].split("|")
            assert len(asked) <= 50, "wbgetentities takes at most 50 ids"
            labels = {
                qid: DISTRICT_LABELS.get(qid, {"labels": {"en": {"value": qid}}})
                for qid in asked
            }
            return httpx.Response(200, json={"entities": labels})
        if host == "www.wikidata.org":
            return httpx.Response(
                200, json={"entities": {"Q15111371": FAMILY_NAME, "Q1891": self.city}}
            )
        if host == "commons.wikimedia.org":
            pages = [
                {
                    "title": title,
                    "imageinfo": [
                        {
                            "extmetadata": {
                                "LicenseShortName": {"value": self.licence},
                                "Artist": {
                                    "value": f'<a href="/wiki/User:X">{HERO_AUTHOR}</a>'
                                },
                            }
                        }
                    ],
                }
                for title in params["titles"].split("|")
            ]
            return httpx.Response(200, json={"query": {"pages": pages}})
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
        if host.endswith("wikivoyage.org") and "titles" in params:
            missing = [{"title": params["titles"], "missing": True}]
            return httpx.Response(200, json={"query": {"pages": missing}})
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
                if not self.wiki:
                    pages.append({"title": title, "missing": True})
                elif "Museums" in title or "Palaces" in title:
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
    assert found.hero is not None and found.hero.file == HERO_FILE
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


def test_the_hero_photo_is_the_free_wikidata_image(tmp_path: Path) -> None:
    with _client(tmp_path, Answers()) as client:
        found = discover(client, "Bologna")

    credit = f"{HERO_AUTHOR} (CC BY-SA 3.0) · Wikimedia Commons"
    assert found.hero is not None
    assert found.hero.file == HERO_FILE  # the preferred claim, not the first one
    assert found.hero.credit == credit
    text = render(found)
    assert "[hero]" in text and "# review:" not in text
    assert tomllib.loads(text)["hero"] == {"file": HERO_FILE, "credit": credit}

    path = tmp_path / "bologna.toml"
    path.write_text(text, encoding="utf-8")
    hero = load_city(path).hero
    assert hero is not None and hero.file == HERO_FILE
    assert f"hero photo: {HERO_FILE}" in summary(found)


def test_a_non_free_image_leaves_the_hero_table_for_review(tmp_path: Path) -> None:
    with _client(tmp_path, Answers(licence="CC BY-NC 2.0")) as client:
        found = discover(client, "Bologna")

    assert found.hero is None
    assert any("no freely licensed Wikidata image" in note for note in found.notes)
    text = render(found)
    assert 'file = ""  # review' in text and 'credit = ""  # review' in text
    path = tmp_path / "bologna.toml"
    path.write_text(text, encoding="utf-8")
    hero = load_city(path).hero
    assert hero is not None and hero.file == ""  # a draft still loads


def test_a_city_without_a_wikidata_image_asks_no_question_of_commons(
    tmp_path: Path,
) -> None:
    answers = Answers(city=_item("Q1891", image=False))
    with _client(tmp_path, answers) as client:
        found = discover(client, "Bologna")

    assert found.hero is None
    assert not [r for r in answers.requests if r.url.host == "commons.wikimedia.org"]
    assert "hero photo: none" in summary(found)


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


def _overpass_query(answers: Answers) -> str:
    [request] = [r for r in answers.requests if r.url.host == "overpass-api.de"]
    return httpx.QueryParams(request.content.decode())["data"]


def test_overpass_area_is_the_relation_when_wikidata_names_one(tmp_path: Path) -> None:
    answers = Answers()
    with _client(tmp_path, answers) as client:
        found = discover(client, "Bologna")

    assert _overpass_query(answers).startswith(
        "[out:json][timeout:60];area(id:3600043172)->.a;"
    )
    text = render(found)
    assert "osm_relation = 43172" in text
    assert "# review:" not in text
    assert tomllib.loads(text)["osm_relation"] == 43172


def test_without_a_relation_the_area_is_by_name_and_marked(tmp_path: Path) -> None:
    city = _item("Q1891", P150=CITY["claims"]["P150"])  # no P402
    answers = Answers(city=city)
    with _client(tmp_path, answers) as client:
        found = discover(client, "Bologna")

    assert _overpass_query(answers).startswith(
        '[out:json][timeout:60];area["name"="Bologna"]["admin_level"="8"]->.a;'
    )
    assert any("no OSM relation" in note for note in found.notes)
    text = render(found)
    assert "osm_relation =" not in text
    assert 'osm_area = "Bologna"  # review: must be the local OSM `name`' in text


def test_district_labels_are_fetched_in_batches_of_fifty(tmp_path: Path) -> None:
    qids = [f"Q{n}" for n in range(1, 121)]
    answers = Answers()
    with _client(tmp_path, answers) as client:
        districts = module.fetch_district_labels(client, qids)

    label_requests = [
        r for r in answers.requests if dict(r.url.params).get("props") == "labels"
    ]
    sizes = [len(dict(r.url.params)["ids"].split("|")) for r in label_requests]
    assert sizes == [50, 50, 20]
    assert len(districts) == 120


def test_a_wikidata_api_error_is_a_discovery_error(tmp_path: Path) -> None:
    def broken(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"error": {"code": "toomanyvalues", "info": "Too many values"}}
        )

    client = ApiClient(tmp_path, transport=httpx.MockTransport(broken))
    with pytest.raises(DiscoveryError, match=r"Wikidata: .*toomanyvalues"):
        discover(client, "Bologna")


def test_a_draft_without_wiki_sources_still_loads(tmp_path: Path) -> None:
    city = _item("Q1891", P402=CITY["claims"]["P402"])
    city["sitelinks"] = {}
    with _client(tmp_path, Answers(city=city, wiki=False, overpass=False)) as client:
        found = discover(client, "Bologna")

    assert found.guides == [] and found.categories == []
    text = render(found)
    assert "# review: no Wikivoyage article found" in text
    assert "# review: no standard Wikipedia category exists" in text
    assert "# Wikidata district label (no OSM boundary found)" in text
    path = tmp_path / "cities" / "bologna.toml"
    path.parent.mkdir()
    path.write_text(text, encoding="utf-8")
    loaded = load_city(path)
    assert loaded.wikivoyage == () and loaded.wikipedia_categories == ()
    assert loaded.osm_relation == 43172
