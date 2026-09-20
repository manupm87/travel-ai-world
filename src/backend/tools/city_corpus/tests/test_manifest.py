"""`data/cities.json`: one entry per configured city with a built corpus."""

import json
from dataclasses import replace
from pathlib import Path

from city_corpus.config.cities import BUDAPEST, HeroPhoto, WikivoyageSite
from city_corpus.manifest import cities_manifest, write_cities_manifest

BOLOGNA = replace(
    BUDAPEST,
    slug="bologna",
    name="Bologna",
    aliases=("bolonia", "bologna"),
    centre=(44.4939, 11.3428),
    timezone="Europe/Rome",
    wikivoyage=(WikivoyageSite("en", "Bologna"),),
    hero=None,
)
CREDIT = "Thomas Depenbusch (Depi) (CC BY 2.0) · Wikimedia Commons"
BUDAPEST_WITH_HERO = replace(
    BUDAPEST, hero=HeroPhoto(file="Budapest at night.jpg", credit=CREDIT)
)

LEAD_EN = (
    "Budapest\n\nBudapest is the capital city of Hungary. It sits on the Danube.\n\n"
    "The modern-day city results from the amalgamation of two historic towns, "
    "Buda on the hilly west bank and Pest on the flat east one, which is why a "
    "walk across any of its bridges is the first thing anyone recommends, and "
    "why the two halves still feel like different cities at any hour of any day "
    "of the week, whatever the season, to every visitor who takes the time to "
    "look at both of them properly. Nowhere else in central Europe can you soak "
    "in a thermal bath at dawn and be at a ruin bar before midnight. This last "
    "sentence does not fit and is cut away."
)
LEAD_ES = "Budapest\n\nBudapest es la capital de Hungría. Está sobre el Danubio."


def _built(data_dir: Path, slug: str, documents: int, built_at: str) -> Path:
    folder = data_dir / slug
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(
        json.dumps({"city": slug, "documents": documents, "built_at": built_at})
    )
    return folder


def _documents(folder: Path, *documents: dict[str, str]) -> None:
    (folder / "documents.jsonl").write_text(
        "".join(json.dumps(d, ensure_ascii=False) + "\n" for d in documents),
        encoding="utf-8",
    )


def _intro_doc(lang: str, root: str, text: str) -> dict[str, str]:
    return {
        "doc_id": f"wv:{lang}:{root}#section:intro:c1",
        "text": text,
        "source_url": f"https://{lang}.wikivoyage.org/wiki/{root}",
        "license": "CC BY-SA 4.0",
        "lang": lang,
    }


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
        "intro": {},
        "image_url": None,
        "image_credit": None,
    }
    assert entries[1]["documents"] == 6330
    assert entries[1]["aliases"] == ["budapest"]


def test_the_intro_comes_from_the_corpus_lead_per_language(tmp_path: Path) -> None:
    folder = _built(tmp_path, "budapest", 3, "2026-09-17T23:14:43Z")
    _documents(
        folder,
        {"doc_id": "wv:en:Budapest#see:parliament", "text": "Parliament", "lang": "en"},
        _intro_doc("en", "Budapest", LEAD_EN),
        _intro_doc("es", "Budapest", LEAD_ES),
    )

    [entry] = cities_manifest(tmp_path, {"budapest": BUDAPEST})

    intro = entry["intro"]
    assert sorted(intro) == ["en", "es"]
    assert intro["es"] == {
        "text": "Budapest es la capital de Hungría. Está sobre el Danubio.",
        "source_url": "https://es.wikivoyage.org/wiki/Budapest",
    }
    # The title line goes; the paragraph break stays; the tail is cut at the
    # last sentence that fits, never mid-sentence.
    text = intro["en"]["text"]
    assert text.startswith("Budapest is the capital city of Hungary.")
    assert "\n\nThe modern-day city" in text
    assert len(text) <= 600
    assert text.endswith("at a ruin bar before midnight.")
    assert "cut away" not in text


def test_a_language_without_a_lead_is_absent(tmp_path: Path) -> None:
    folder = _built(tmp_path, "budapest", 2, "2026-09-17T23:14:43Z")
    _documents(folder, _intro_doc("en", "Budapest", LEAD_EN))

    [entry] = cities_manifest(tmp_path, {"budapest": BUDAPEST})

    assert list(entry["intro"]) == ["en"]


def test_the_hero_photo_becomes_a_commons_url_and_its_credit(tmp_path: Path) -> None:
    _built(tmp_path, "budapest", 1, "2026-09-17T23:14:43Z")

    [entry] = cities_manifest(tmp_path, {"budapest": BUDAPEST_WITH_HERO})

    assert entry["image_url"] == (
        "https://commons.wikimedia.org/w/index.php"
        "?title=Special:FilePath/Budapest_at_night.jpg&width=1200"
    )
    assert entry["image_credit"] == CREDIT


def test_a_city_without_a_hero_photo_has_none(tmp_path: Path) -> None:
    _built(tmp_path, "bologna", 1, "2026-09-20T10:00:00Z")

    [entry] = cities_manifest(tmp_path, {"bologna": BOLOGNA})

    assert entry["image_url"] is None and entry["image_credit"] is None


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
