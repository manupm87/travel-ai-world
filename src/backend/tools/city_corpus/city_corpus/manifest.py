"""The cities manifest: `data/cities.json`, what the planner knows about each city.

One entry per city that has both a configuration (`cities/<slug>.toml`) and a
built corpus (`data/<slug>/manifest.json`): the slug, the name, the spellings a
traveller may type, the centre, the time zone, how many documents the corpus
holds and when it was built. `ai_api` ships a copy of this file in its image
(`just corpus-manifest` copies it) and takes its list of destinations from it,
so adding a city needs no deployment variable.

Rebuilt whole from the folders every time, sorted by slug: a city whose corpus
was removed drops out, one just built joins.
"""

import json
from pathlib import Path
from typing import Any

from city_corpus.config.cities import CityConfig

CITIES_MANIFEST = "cities.json"


def city_entry(city: CityConfig, corpus_manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "slug": city.slug,
        "name": city.name,
        "aliases": sorted(set(city.aliases) | {city.slug}),
        "centre": [city.centre[0], city.centre[1]],
        "timezone": city.timezone,
        "documents": int(corpus_manifest.get("documents", 0)),
        "built_at": corpus_manifest.get("built_at"),
    }


def cities_manifest(
    data_dir: Path, cities: dict[str, CityConfig]
) -> list[dict[str, Any]]:
    """Entries for every configured city whose corpus is built, sorted by slug."""
    entries: list[dict[str, Any]] = []
    for slug in sorted(cities):
        path = data_dir / slug / "manifest.json"
        if not path.exists():
            continue
        corpus_manifest = json.loads(path.read_text(encoding="utf-8"))
        entries.append(city_entry(cities[slug], corpus_manifest))
    return entries


def write_cities_manifest(data_dir: Path, cities: dict[str, CityConfig]) -> Path:
    """Write `data/cities.json` and return its path."""
    entries = cities_manifest(data_dir, cities)
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / CITIES_MANIFEST
    path.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path
