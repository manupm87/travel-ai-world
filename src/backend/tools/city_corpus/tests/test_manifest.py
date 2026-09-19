"""`data/cities.json`: one entry per configured city with a built corpus."""

import json
from dataclasses import replace
from pathlib import Path

from city_corpus.config.cities import BUDAPEST
from city_corpus.manifest import cities_manifest, write_cities_manifest

BOLOGNA = replace(
    BUDAPEST,
    slug="bologna",
    name="Bologna",
    aliases=("bolonia", "bologna"),
    centre=(44.4939, 11.3428),
    timezone="Europe/Rome",
)


def _built(data_dir: Path, slug: str, documents: int, built_at: str) -> None:
    folder = data_dir / slug
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(
        json.dumps({"city": slug, "documents": documents, "built_at": built_at})
    )


def test_lists_built_cities_sorted_with_their_facts(tmp_path: Path) -> None:
    _built(tmp_path, "budapest", 6330, "2026-09-17T23:14:43Z")
    _built(tmp_path, "bologna", 1200, "2026-09-20T10:00:00Z")

    entries = cities_manifest(tmp_path, {"budapest": BUDAPEST, "bologna": BOLOGNA})

    assert [e["slug"] for e in entries] == ["bologna", "budapest"]
    assert entries[0] == {
        "slug": "bologna",
        "name": "Bologna",
        "aliases": ["bologna", "bolonia"],
        "centre": [44.4939, 11.3428],
        "timezone": "Europe/Rome",
        "documents": 1200,
        "built_at": "2026-09-20T10:00:00Z",
    }
    assert entries[1]["documents"] == 6330
    assert entries[1]["aliases"] == ["budapest"]


def test_a_configured_city_without_a_corpus_is_left_out(tmp_path: Path) -> None:
    _built(tmp_path, "budapest", 10, "2026-09-17T00:00:00Z")

    entries = cities_manifest(tmp_path, {"budapest": BUDAPEST, "bologna": BOLOGNA})

    assert [e["slug"] for e in entries] == ["budapest"]


def test_write_is_deterministic_and_rebuilt_whole(tmp_path: Path) -> None:
    _built(tmp_path, "budapest", 10, "2026-09-17T00:00:00Z")
    _built(tmp_path, "bologna", 5, "2026-09-18T00:00:00Z")
    path = write_cities_manifest(tmp_path, {"budapest": BUDAPEST, "bologna": BOLOGNA})
    first = path.read_text(encoding="utf-8")

    # Bologna's corpus goes away: the next write drops it instead of keeping it.
    write_cities_manifest(tmp_path, {"budapest": BUDAPEST})

    assert path == tmp_path / "cities.json"
    assert first.endswith("\n") and json.loads(first)[0]["slug"] == "bologna"
    assert [e["slug"] for e in json.loads(path.read_text())] == ["budapest"]
