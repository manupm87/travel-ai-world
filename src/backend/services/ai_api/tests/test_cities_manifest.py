"""The cities manifest the service ships is the one the corpus tool wrote."""

import json
from pathlib import Path

import pytest
from ai_api.infrastructure import cities as cities_module
from ai_api.infrastructure.cities import City, load_cities, select_cities

SERVICE = Path(__file__).resolve().parents[1]
PACKAGED = SERVICE / "ai_api" / "data" / "cities.json"
CORPUS = SERVICE.parents[1] / "tools" / "city_corpus" / "data" / "cities.json"


def test_the_packaged_manifest_is_the_corpus_tool_s():
    # `just corpus-manifest` copies it; CI catches a build that forgot to.
    assert PACKAGED.read_text(encoding="utf-8") == CORPUS.read_text(encoding="utf-8")


def test_the_manifest_lists_budapest():
    entries = json.loads(PACKAGED.read_text(encoding="utf-8"))
    cities = load_cities()

    assert [e["slug"] for e in entries] == [c.slug for c in cities]
    budapest = next(c for c in cities if c.slug == "budapest")
    assert budapest.name == "Budapest"
    assert (budapest.country, budapest.country_code) == ("Hungary", "HU")
    assert "budapest" in budapest.aliases
    assert budapest.timezone == "Europe/Budapest"
    assert budapest.centre == (47.4979, 19.0402)


def test_budapest_carries_its_intro_and_its_photo():
    budapest = next(c for c in load_cities() if c.slug == "budapest")

    assert sorted(budapest.intro) == ["en", "es"]
    assert budapest.intro["en"].text.startswith("Budapest is the capital")
    assert budapest.intro["en"].source_url == "https://en.wikivoyage.org/wiki/Budapest"
    assert budapest.intro["es"].source_url == "https://es.wikivoyage.org/wiki/Budapest"
    # The title line is not part of the text, and it is never cut mid-sentence.
    assert not budapest.intro["es"].text.startswith("Budapest\n")
    assert budapest.intro["es"].text.endswith(".")
    assert budapest.image_url is not None
    assert budapest.image_url.startswith("https://commons.wikimedia.org/")
    assert budapest.image_credit is not None
    assert budapest.image_credit.endswith("· Wikimedia Commons")


def test_a_manifest_without_the_intro_and_photo_keys_still_loads(monkeypatch):
    """An older `cities.json` (before TRA-182) leaves them empty, not missing."""
    entry = {
        "slug": "budapest",
        "name": "Budapest",
        "aliases": ["budapest"],
        "centre": [47.4979, 19.0402],
        "timezone": "Europe/Budapest",
        "documents": 6330,
        "built_at": "2026-09-17T23:14:43Z",
    }
    monkeypatch.setattr(
        cities_module, "files", lambda _: _Manifest(json.dumps([entry]))
    )

    [budapest] = load_cities()

    assert budapest.intro == {}
    assert budapest.image_url is None and budapest.image_credit is None
    assert budapest.country == "" and budapest.country_code == ""


class _Manifest:
    """Stands in for `importlib.resources.files("ai_api")`: any path is the file."""

    def __init__(self, text: str) -> None:
        self._text = text

    def __truediv__(self, _: str) -> "_Manifest":
        return self

    def read_text(self, encoding: str = "utf-8") -> str:
        return self._text


BUDAPEST = City("budapest", "Budapest", ("budapest",), (47.5, 19.0), "Europe/Budapest")
BOLOGNA = City(
    "bologna", "Bologna", ("bologna", "bolonia"), (44.5, 11.3), "Europe/Rome"
)


def test_no_setting_means_every_city():
    assert select_cities((BOLOGNA, BUDAPEST), None) == (BOLOGNA, BUDAPEST)


def test_the_setting_narrows_in_manifest_order():
    assert select_cities((BOLOGNA, BUDAPEST), ["budapest"]) == (BUDAPEST,)


def test_an_unknown_slug_is_named_with_the_known_ones():
    with pytest.raises(ValueError, match="names berlin; the manifest knows bologna"):
        select_cities((BOLOGNA,), ["berlin"])
