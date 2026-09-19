"""The cities manifest the service ships is the one the corpus tool wrote."""

import json
from pathlib import Path

import pytest
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
    assert "budapest" in budapest.aliases
    assert budapest.timezone == "Europe/Budapest"
    assert budapest.centre == (47.4979, 19.0402)


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
