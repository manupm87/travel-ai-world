"""The cities the planner covers, from the manifest shipped in the package.

`data/cities.json` is written by the `city_corpus` tool when a city is built
(`just corpus-manifest` copies it here) and lists every city whose corpus is
committed: slug, name, the spellings a traveller may type, centre, time zone,
the city's intro per language and its photo (TRA-182; a manifest written
before it has neither). The service reads it once at start-up, so a new city
is a new corpus and a new image, never a deployment variable. `PLANNER_CITIES`
narrows the list for a local run (an unknown slug is a configuration error, named).
"""

import json
from importlib.resources import files
from typing import Any

from ai_api.domain.models import City, CityIntro

__all__ = ["City", "load_cities", "select_cities"]


def _intro(entry: dict[str, Any]) -> dict[str, CityIntro]:
    """The city's intro per language; empty for a manifest written before TRA-182."""
    return {
        lang: CityIntro(
            text=str(intro.get("text", "")),
            source_url=str(intro.get("source_url", "")),
        )
        for lang, intro in (entry.get("intro") or {}).items()
    }


def load_cities() -> tuple[City, ...]:
    """Every city in the packaged manifest, in the manifest's (slug) order."""
    raw = (files("ai_api") / "data" / "cities.json").read_text(encoding="utf-8")
    return tuple(
        City(
            slug=entry["slug"],
            name=entry["name"],
            aliases=tuple(entry.get("aliases", ())),
            centre=(float(entry["centre"][0]), float(entry["centre"][1])),
            timezone=entry["timezone"],
            intro=_intro(entry),
            image_url=entry.get("image_url"),
            image_credit=entry.get("image_credit"),
        )
        for entry in json.loads(raw)
    )


def select_cities(
    cities: tuple[City, ...], slugs: list[str] | None
) -> tuple[City, ...]:
    """The cities named by `slugs` (all of them when None), manifest order kept."""
    if slugs is None:
        return cities
    known = {city.slug: city for city in cities}
    unknown = sorted(set(slugs) - set(known))
    if unknown:
        raise ValueError(
            f"PLANNER_CITIES names {', '.join(unknown)}; the manifest knows "
            f"{', '.join(sorted(known)) or 'no city'}"
        )
    wanted = set(slugs)
    return tuple(city for city in cities if city.slug in wanted)
