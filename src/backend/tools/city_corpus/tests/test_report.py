import json
from pathlib import Path

import pytest
from city_corpus import report
from city_corpus.build import to_json_line
from city_corpus.cli import main
from city_corpus.config.readiness import Thresholds
from city_corpus.models import Category, CorpusDocument, Kind, Source

TEXT = "A description long enough to pass validation, about a place in the city."


def _doc(doc_id: str, **overrides: object) -> CorpusDocument:
    fields: dict[str, object] = {
        "doc_id": doc_id,
        "city": "testville",
        "category": Category.SEE,
        "kind": Kind.LISTING,
        "name": doc_id.rsplit(":", 1)[-1].replace("-", " ").title(),
        "text": TEXT,
        "heading_path": "Testville › See",
        "source": Source.WIKIVOYAGE,
        "source_url": "https://en.wikivoyage.org/wiki/Testville",
        "lang": "en",
        "district": "Centre",
        "lat": 47.5,
        "lon": 19.05,
    }
    return CorpusDocument.model_validate({**fields, **overrides})


def _corpus() -> list[CorpusDocument]:
    docs = [
        _doc(
            "wv:en:T#see:rudas-baths",
            image_url="https://c/rudas.jpg",
            text="Thermal baths and a small museum of bathing in the old wing.",
        ),
        _doc("wv:en:T#see:castle", image_url="https://c/castle.jpg", district="Hill"),
        _doc("wv:en:T#see:unplaced-gallery", lat=None, lon=None),
        _doc("wv:en:T#see:plain-square"),  # located, no image
        _doc(
            "wp:en:1#s0-c1",
            category=Category.HISTORY,
            kind=Kind.PROSE,
            name="Old Town History",
            source=Source.WIKIPEDIA,
            source_url="https://en.wikipedia.org/wiki/Old_Town",
            image_url="https://c/old.jpg",
        ),
        _doc("wv:en:T#section:see:c1", kind=Kind.PROSE, name=None, lat=None, lon=None),
        _doc("wv:en:T#eat:paprika-restaurant", category=Category.EAT, price_tier=2),
        _doc(
            "osm:node/1",
            category=Category.EAT,
            source=Source.OPENSTREETMAP,
            license="ODbL 1.0",
            source_url="https://www.openstreetmap.org/node/1",
            name="Street Food Corner",
            text="Street food stall with the best street food in town, open late.",
        ),
        _doc(
            "wv:en:T#drink:szimpla",
            category=Category.DRINK,
            text="A ruin bar pouring craft beer from local breweries.",
        ),
        _doc("wv:en:T#sleep:grand-hotel", category=Category.SLEEP, price_tier=3),
        _doc("wv:en:T#sleep:hostel-one", category=Category.SLEEP, lat=None, lon=None),
        _doc(
            "tour:testville:old-town",
            category=Category.TOUR,
            name="Free Old Town Walk",
            source=Source.CURATED,
            source_url="https://example.org/old-town",
            tour_type="walking",
        ),
        _doc(
            "wv:en:T#do:river-cruise",
            category=Category.TOUR,
            name="River Cruise",
            tour_type="boat",
        ),
    ]
    docs += [
        _doc(
            f"om:climate:testville:{month:02d}",
            category=Category.CLIMATE,
            kind=Kind.PROSE,
            name=f"Month {month}",
            source=Source.OPEN_METEO,
            license="CC BY 4.0",
            source_url="https://open-meteo.com/",
            district=None,
            lat=None,
            lon=None,
        )
        for month in range(1, 12)  # eleven months: one is missing on purpose
    ]
    return docs


def test_counts_per_category_and_source() -> None:
    summary = report.summarise(_corpus(), "testville")

    assert summary.documents == 24
    assert (summary.listings, summary.prose) == (11, 13)
    assert summary.by_category_source["see"] == {"wikivoyage": 5}
    assert summary.by_category_source["eat"] == {"openstreetmap": 1, "wikivoyage": 1}
    assert summary.by_category_source["history"] == {"wikipedia": 1}
    assert summary.by_category_source["tour"] == {"curated": 1, "wikivoyage": 1}


def test_located_and_pictured_count_named_documents_of_any_kind() -> None:
    summary = report.summarise(_corpus(), "testville")

    assert summary.named_by_category["see"] == 4
    assert summary.located_by_category["see"] == 3
    assert summary.pictured_by_category["see"] == 2
    # Wikipedia prose with a name and coordinates is a place too.
    assert summary.located_by_category["history"] == 1
    assert summary.pictured_by_category["history"] == 1
    assert summary.located_sights == 4
    assert summary.pictured_sights_share == pytest.approx(3 / 4)
    assert (summary.sleep, summary.located_sleep) == (2, 1)


def test_districts_price_tiers_and_climate() -> None:
    summary = report.summarise(_corpus(), "testville")

    assert summary.districts == ["Centre", "Hill"]
    assert summary.places_by_district == {"Centre": 9, "Hill": 1}
    assert summary.small_districts == ["Centre", "Hill"]
    assert summary.price_tiers["eat"] == {"1": 0, "2": 1, "3": 0, "untiered": 1}
    assert summary.price_tiers["sleep"] == {"1": 0, "2": 0, "3": 1, "untiered": 1}
    assert len(summary.climate_months) == 11
    assert summary.climate_missing == ["12"]


def test_smoke_query_ranks_the_named_place_first() -> None:
    summary = report.summarise(_corpus(), "testville")

    museum = summary.smoke["see"]["museum"]
    assert [hit.name for hit in museum] == ["Rudas Baths"]
    street_food = summary.smoke["eat"]["street food"]
    assert street_food[0].name == "Street Food Corner"
    assert street_food[0].district == "Centre"
    assert summary.smoke["drink"]["craft beer bar"][0].name == "Szimpla"
    walks = summary.smoke["tour"]["free walking tour"]
    assert [hit.name for hit in walks] == ["Free Old Town Walk"]


def test_gate_lists_every_missed_threshold_with_its_value() -> None:
    summary = report.summarise(_corpus(), "testville")

    failures = report.gate(summary)
    assert failures == [
        "Located see + history + do places: 4 (needs ≥ 150)",
        "Located eat places: 2 (needs ≥ 100)",
        "Sleep documents: 2 (needs ≥ 20)",
        "Located sleep places: 1 (needs ≥ 10)",
        "Pictured located sleep places: 0 (needs ≥ 10)",
        "Districts: 2 (needs ≥ 5)",
        "Districts with a neighbourhood document: 0 (needs ≥ 5)",
        "Climate normals: 11 (needs = 12)",
        "Curated tours: 1 (needs ≥ 3)",
        "Tour documents: 2 (needs ≥ 3)",
    ]
    lenient = Thresholds(
        located_sights=4,
        located_eat=2,
        sleep=2,
        located_sleep=1,
        pictured_sleep=0,
        districts=2,
        described_districts=0,
        climate_normals=11,
        curated_tours=1,
        tour_documents=2,
    )
    assert report.gate(summary, lenient) == []


def test_tours_count_curated_and_reclassified_by_type() -> None:
    summary = report.summarise(_corpus(), "testville")

    assert summary.curated_tours == 1
    assert summary.reclassified_tours == 1
    assert summary.tour_documents == 2
    assert summary.tours_by_type == {"boat": 1, "walking": 1}
    assert summary.tour_names == ["Free Old Town Walk", "River Cruise"]
    markdown = report.render_markdown(summary)
    assert "2 tour documents: 1 curated" in markdown
    assert "- Free Old Town Walk" in markdown
    assert "| Curated tours | ≥ 3 | 1 | **FAIL** |" in markdown


PHOTOS = {
    "commons": 1,
    "site": 1,
    "facebook": 0,
    "page": 0,
    "dropped": 4,
    "dropped_examples": ["Hotel Astra", "Hotel Zero"],
}


def test_the_hotels_section_accounts_for_every_photo() -> None:
    corpus = [
        *_corpus(),
        _doc("osm:way/1", category=Category.SLEEP, image_url="https://c/a.jpg"),
        _doc("osm:way/2", category=Category.SLEEP, image_url="https://c/b.jpg"),
        _doc("osm:way/3", category=Category.SLEEP, image_url="https://c/c.jpg"),
    ]
    summary = report.summarise(corpus, "testville", hotel_photos=PHOTOS)

    markdown = report.render_markdown(summary)
    assert "## Hotels" in markdown
    # Three pictured stays, two of them found by the stage: one is the corpus's.
    assert "| corpus | 1 |" in markdown
    assert "| commons | 1 |" in markdown
    assert "| site | 1 |" in markdown
    assert "| facebook | 0 |" in markdown
    assert "| page | 0 |" in markdown
    assert "4 hotels dropped for lack of a photo: Hotel Astra, Hotel Zero…" in markdown


def test_without_a_manifest_the_hotels_section_prints_the_total() -> None:
    summary = report.summarise(_corpus(), "testville")

    markdown = report.render_markdown(summary)
    assert "0 of 1 located sleep places are pictured." in markdown
    assert "| Source | Hotels |" not in markdown


def test_the_gate_wants_pictured_stays() -> None:
    lenient = Thresholds(pictured_sleep=1)
    pictured = [
        *_corpus(),
        _doc("osm:way/1", category=Category.SLEEP, image_url="https://c/a.jpg"),
    ]

    blind = report.summarise(_corpus(), "testville")
    assert "Pictured located sleep places: 0 (needs ≥ 1)" in report.gate(blind, lenient)
    seeing = report.summarise(pictured, "testville")
    assert "Pictured located sleep places" not in " ".join(report.gate(seeing, lenient))


def test_markdown_is_deterministic_and_ends_with_the_gate() -> None:
    summary = report.summarise(_corpus(), "testville", built_at="2026-09-19T00:00:00Z")

    first = report.render_markdown(summary)
    second = report.render_markdown(
        report.summarise(_corpus(), "testville", built_at="2026-09-19T00:00:00Z")
    )

    assert first == second
    assert first.startswith(
        "# Readiness report — testville\n\nBuilt 2026-09-19T00:00:00Z"
    )
    assert "| Rudas Baths" not in first  # smoke hits are a list, not a table
    assert "1. Rudas Baths (Centre)" in first
    assert first.rstrip().endswith("The corpus fails the readiness gate.")
    assert "| Climate normals | = 12 | 11 | **FAIL** |" in first


def test_json_twin_carries_the_checks() -> None:
    data = json.loads(report.as_json(report.summarise(_corpus(), "testville")))

    assert data["readiness"]["passed"] is False
    names = [check["name"] for check in data["readiness"]["checks"]]
    assert "Climate normals" in names
    assert data["readiness"]["thresholds"]["located_sights"] == 150
    assert data["smoke"]["see"]["museum"][0]["name"] == "Rudas Baths"


def test_cli_writes_both_files_and_gates(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    folder = tmp_path / "testville"
    folder.mkdir()
    (folder / "documents.jsonl").write_text(
        "".join(to_json_line(d) + "\n" for d in _corpus()), encoding="utf-8"
    )
    (folder / "manifest.json").write_text(
        json.dumps(
            {"built_at": "2026-09-19T00:00:00Z", "enrichment": {"photos": PHOTOS}}
        )
    )

    assert main(["report", "testville", "--data-dir", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "FAIL Districts: 2 (needs ≥ 5)" in out
    assert (
        (folder / "report.md")
        .read_text(encoding="utf-8")
        .startswith("# Readiness report — testville\n\nBuilt 2026-09-19T00:00:00Z")
    )
    data = json.loads((folder / "report.json").read_text(encoding="utf-8"))
    assert data["city"] == "testville"
    # The manifest's photo counters travel into the report (ADR 0022).
    assert data["hotel_photos"] == PHOTOS
    assert "| Source | Hotels |" in (folder / "report.md").read_text(encoding="utf-8")

    assert main(["report", "testville", "--data-dir", str(tmp_path), "--no-gate"]) == 0


def test_cli_reports_a_missing_corpus(tmp_path: Path) -> None:
    assert main(["report", "nowhere", "--data-dir", str(tmp_path)]) == 1
