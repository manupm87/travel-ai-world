"""The cities manifest: `data/cities.json`, what the planner knows about each city.

One entry per city that has both a configuration (`cities/<slug>.toml`) and a
built corpus (`data/<slug>/manifest.json`): the slug, the name, the spellings a
traveller may type, the centre, the time zone, how many documents the corpus
holds and when it was built, plus what the trip overview shows — the city's
intro per language and its hero photo (TRA-182). `ai_api` ships a copy of this
file in its image (`just corpus-manifest` copies it) and takes its list of
destinations from it, so adding a city needs no deployment variable.

The intro is derived, never fetched: it is the lead of the city's Wikivoyage
article, already in the built corpus as `wv:<lang>:<root>#section:intro:c1`.
The hero photo is curated in `cities/<slug>.toml` (`[hero]`, drafted by
`discover` with the licence checked on Commons). Writing the manifest therefore
stays offline and deterministic.

Rebuilt whole from the folders every time, sorted by slug: a city whose corpus
was removed drops out, one just built joins.
"""

import json
import re
from pathlib import Path
from typing import Any

from city_corpus.config.cities import CityConfig
from city_corpus.sources.wikidata import thumbnail_url

CITIES_MANIFEST = "cities.json"
DOCUMENTS = "documents.jsonl"

INTRO_DOC_ID = "wv:{lang}:{root}#section:intro:c1"
"""The lead of a Wikivoyage city article, as the builder ids it."""

INTRO_MAX_CHARS = 600
"""How much of the lead the overview gets: a paragraph or two."""

HERO_WIDTH = 1200
"""Hero photos are shown full width; the cards' thumbnails are 640 px."""

_SENTENCE_END = re.compile(r"[.!?…](?=\s|$)")
"""A full stop that ends a sentence rather than an abbreviation mid-word."""


def intro_text(text: str) -> str:
    """A Wikivoyage lead as the overview shows it.

    The document starts with the article title on its own line ("Budapest\\n\\n
    Budapest is the capital…"); it is dropped. What is left is cut at the last
    sentence that fits in `INTRO_MAX_CHARS`, paragraph breaks kept (`\\n\\n`),
    so the page never shows half a sentence. A lead with no sentence end inside
    the window is cut at a word and marked with an ellipsis.
    """
    _, _, body = text.partition("\n")
    body = body.strip()
    if len(body) <= INTRO_MAX_CHARS:
        return body
    window = body[:INTRO_MAX_CHARS]
    ends = [match.end() for match in _SENTENCE_END.finditer(window)]
    if ends:
        return window[: ends[-1]].rstrip()
    cut = window.rstrip()
    if " " in cut:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip() + "…"


def city_intro(city: CityConfig, city_dir: Path) -> dict[str, dict[str, str]]:
    """The city's lead per Wikivoyage language, from the built corpus.

    A language whose corpus holds no intro document is absent (the article may
    have none, or the city may not be on that Wikivoyage at all).
    """
    wanted = {
        INTRO_DOC_ID.format(lang=site.lang, root=site.root): site.lang
        for site in city.wikivoyage
    }
    path = city_dir / DOCUMENTS
    if not wanted or not path.exists():
        return {}
    intro: dict[str, dict[str, str]] = {}
    with path.open(encoding="utf-8") as lines:
        for line in lines:
            if "#section:intro:c1" not in line:
                continue
            document = json.loads(line)
            lang = wanted.get(document.get("doc_id", ""))
            if lang is None or lang in intro:
                continue
            text = intro_text(document.get("text", ""))
            if not text:
                continue
            intro[lang] = {
                "text": text,
                "source_url": document.get("source_url", ""),
            }
    return {lang: intro[lang] for lang in sorted(intro)}


def city_entry(
    city: CityConfig, corpus_manifest: dict[str, Any], city_dir: Path
) -> dict[str, Any]:
    hero = city.hero if city.hero and city.hero.file else None
    return {
        "slug": city.slug,
        "name": city.name,
        "aliases": sorted(set(city.aliases) | {city.slug}),
        "centre": [city.centre[0], city.centre[1]],
        "timezone": city.timezone,
        "documents": int(corpus_manifest.get("documents", 0)),
        "built_at": corpus_manifest.get("built_at"),
        "intro": city_intro(city, city_dir),
        "image_url": thumbnail_url(hero.file, HERO_WIDTH) if hero else None,
        "image_credit": hero.credit if hero else None,
    }


def cities_manifest(
    data_dir: Path, cities: dict[str, CityConfig]
) -> list[dict[str, Any]]:
    """Entries for every configured city whose corpus is built, sorted by slug."""
    entries: list[dict[str, Any]] = []
    for slug in sorted(cities):
        city_dir = data_dir / slug
        path = city_dir / "manifest.json"
        if not path.exists():
            continue
        corpus_manifest = json.loads(path.read_text(encoding="utf-8"))
        entries.append(city_entry(cities[slug], corpus_manifest, city_dir))
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
