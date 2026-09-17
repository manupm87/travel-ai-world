import datetime as dt
from pathlib import Path
from typing import Any

import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.models import CC_BY_SA, Category, CorpusDocument, Kind, Source
from city_corpus.sources import tours

VALID = """
[[tour]]
id = "jewish-quarter"
name = "Jewish Quarter Free Tour"
operator = "Example Tours"
operator_url = "https://example.hu/"
url = "https://example.hu/jewish-quarter"
summary = "Synagogues, courtyards and ruin bars of District VII, with the history of the ghetto."
meeting_point = "Deák Ferenc tér, by the Lutheran church"
address = "Deák Ferenc tér 4"
lat = 47.4975
lon = 19.0541
start_times = ["14:00", "10:30", "14:00"]
days = "daily"
duration_minutes = 150
languages = ["English", "Spanish"]
booking_required = true
checked = 2026-09-17
notes = "Winter schedule not published."

[[tour]]
id = "danube-bike"
tour_type = "bike"
price_model = "paid"
name = "Danube Bike Tour"
operator = "Example Tours"
operator_url = "https://example.hu/"
url = "https://example.hu/bike"
summary = "Both banks of the Danube by bike, with stops at the bridges and Margaret Island."
meeting_point = "Oktogon"
lat = 47.5054
lon = 19.0636
start_times = ["09:00"]
days = "Mon, Wed, Fri"
duration_minutes = 180
languages = ["English"]
checked = 2026-01-02

[reclassify]
include = [{ doc_id = "wv:en:Budapest#do:dinner-cruise", tour_type = "boat" }]
exclude = ["wv:en:Budapest/Hegyvidek#do:hiking-area"]
"""


class FixedDistrict:
    def locate(self, lat: float, lon: float) -> str | None:
        return "Belváros"


def _write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "tours.toml"
    path.write_text(text, encoding="utf-8")
    return path


def _listing(
    doc_id: str, name: str, heading_path: str, **overrides: Any
) -> CorpusDocument:
    fields: dict[str, Any] = {
        "doc_id": doc_id,
        "city": "budapest",
        "category": Category.DO,
        "kind": Kind.LISTING,
        "name": name,
        "text": f"{name}\n{heading_path}\nA description long enough.",
        "heading_path": heading_path,
        "source": Source.WIKIVOYAGE,
        "source_url": "https://en.wikivoyage.org/wiki/Budapest",
        "lang": "en",
    }
    return CorpusDocument.model_validate({**fields, **overrides})


def test_load_valid_file(tmp_path: Path) -> None:
    curated = tours.load(_write(tmp_path, VALID), BUDAPEST)

    assert [t.id for t in curated.tours] == ["danube-bike", "jewish-quarter"]
    jewish = curated.tours[1]
    assert jewish.start_times == ["10:30", "14:00"]  # sorted, de-duplicated
    assert (jewish.tour_type, jewish.price_model) == ("walking", "tip-based")
    assert curated.reclassify.exclude == ["wv:en:Budapest/Hegyvidek#do:hiking-area"]


def test_missing_file_is_empty(tmp_path: Path) -> None:
    curated = tours.load(tmp_path / "nope.toml", BUDAPEST)
    assert curated.tours == []


def test_invalid_entries_are_all_reported(tmp_path: Path) -> None:
    broken = (
        VALID.replace('"14:00", "10:30"', '"2pm", "10:30"')
        .replace("lat = 47.5054", "lat = 40.4")
        .replace('tour_type = "bike"', 'tour_type = "zeppelin"')
        .replace('url = "https://example.hu/jewish-quarter"', 'url = "example.hu"')
        .replace('id = "danube-bike"', 'id = "jewish-quarter"')
    )
    with pytest.raises(tours.TourDataError) as error:
        tours.load(_write(tmp_path, broken), BUDAPEST)
    message = str(error.value)
    for problem in ("HH:MM", "http(s) URL", "must be one of"):
        assert problem in message
    assert "duplicate id" not in message  # the second entry failed validation first


def test_outside_city_and_duplicates(tmp_path: Path) -> None:
    broken = VALID.replace("lat = 47.5054", "lat = 40.4").replace(
        'id = "danube-bike"', 'id = "jewish-quarter"'
    )
    with pytest.raises(tours.TourDataError) as error:
        tours.load(_write(tmp_path, broken), BUDAPEST)
    assert "outside the city" in str(error.value)
    assert "jewish-quarter: duplicate id" in str(error.value)


def test_documents(tmp_path: Path) -> None:
    curated = tours.load(_write(tmp_path, VALID), BUDAPEST)
    bike, jewish = tours.documents(curated.tours, BUDAPEST, FixedDistrict())  # type: ignore[arg-type]

    assert jewish.doc_id == "tour:budapest:jewish-quarter"
    assert (jewish.category, jewish.kind, jewish.tour_type) == (
        Category.TOUR,
        Kind.LISTING,
        "walking",
    )
    assert (jewish.source, jewish.license) == (Source.CURATED, CC_BY_SA)
    assert jewish.heading_path == "Budapest › Belváros › Tours"
    assert jewish.text == (
        "Jewish Quarter Free Tour — walking tour by Example Tours in Budapest, "
        "free, tip-based (pay what you want).\n"
        "Synagogues, courtyards and ruin bars of District VII, with the history of "
        "the ghetto.\n"
        "Meeting point: Deák Ferenc tér, by the Lutheran church, Deák Ferenc tér 4. "
        "Starts: daily at 10:30, 14:00. Duration: about 2 h 30 min. "
        "Languages: English, Spanish.\n"
        "Free registration on the operator's website is required."
    )
    assert (jewish.duration_minutes, jewish.checked) == (150, "2026-09-17")
    assert jewish.url == jewish.source_url == "https://example.hu/jewish-quarter"
    assert "notes" not in jewish.model_dump()
    assert bike.text.startswith(
        "Danube Bike Tour — bike tour by Example Tours in Budapest, paid."
    )


def test_days_that_already_spell_out_the_times_are_not_repeated(tmp_path: Path) -> None:
    text = VALID.replace('days = "daily"', 'days = "daily at 10:30; Sat also at 14:00"')
    curated = tours.load(_write(tmp_path, text), BUDAPEST)
    [doc] = [
        d
        for d in tours.documents(curated.tours, BUDAPEST, None)
        if "10:30" in d.hours or ""
    ]
    assert doc.hours == "daily at 10:30; Sat also at 14:00"
    assert "Starts: daily at 10:30; Sat also at 14:00. Duration:" in doc.text


def test_stale_entries() -> None:
    curated = [
        tours.Tour.model_validate(
            {
                "id": "old",
                "name": "Old",
                "operator": "X",
                "operator_url": "https://x.hu",
                "url": "https://x.hu/old",
                "summary": "A tour that nobody has checked for a very long time now.",
                "meeting_point": "Somewhere",
                "lat": 47.5,
                "lon": 19.05,
                "start_times": ["10:00"],
                "days": "daily",
                "duration_minutes": 60,
                "languages": ["English"],
                "checked": "2026-01-01",
            }
        )
    ]
    assert tours.warn_stale(curated, dt.date(2026, 9, 17)) == ["old"]
    assert tours.warn_stale(curated, dt.date(2026, 3, 1)) == []


@pytest.mark.parametrize(
    ("name", "heading", "expected"),
    [
        ("Palvolgy Cave", "Budapest › North Buda › Do › Cave tours", "cave"),
        ("Boat trip to Margaret Island", "Budapest › Belváros › Do › Boating", "boat"),
        ("Hop-on hop-off bus", "Budapest › Get around", "bus"),
        ("Communism tour", "Budapest › Do", "other"),
        ("Budapest food tour", "Budapest › Do", "food"),
    ],
)
def test_automatic_rule_and_type(name: str, heading: str, expected: str) -> None:
    doc = _listing("wv:en:x#do:y", name, heading)
    assert tours.looks_like_tour(doc)
    assert tours.tour_type(heading, name) == expected


@pytest.mark.parametrize(
    ("name", "heading"),
    [
        ("Buda Protected Landscape Area", "Budapest › Hegyvidék › Do › Walking tours"),
        ("Riding hall", "Budapest › East Pest › Do › Sport"),
        ("Zwack Unicum Museum", "Budapest › Ferencváros › See"),
    ],
)
def test_automatic_rule_ignores_places(name: str, heading: str) -> None:
    assert not tours.looks_like_tour(_listing("wv:en:x#do:y", name, heading))


def test_reclassify_with_include_and_exclude() -> None:
    documents = [
        _listing(
            "wv:en:Budapest#do:dinner-cruise", "Hungaria Koncert", "Budapest › Do"
        ),
        _listing("wv:en:x#do:boat-trip", "Boat trip", "Budapest › Do › Boating"),
        _listing("wv:en:x#do:tours-area", "Tours area", "Budapest › Do › Tours"),
        _listing(
            "wv:en:x#see:castle", "Castle", "Budapest › See", category=Category.SEE
        ),
    ]
    rules = tours.Reclassify.model_validate(
        {
            "include": [
                {"doc_id": "wv:en:Budapest#do:dinner-cruise", "tour_type": "boat"}
            ],
            "exclude": ["wv:en:x#do:tours-area", "wv:en:gone#do:x"],
        }
    )

    counts = tours.reclassify(documents, rules)

    assert [(d.category, d.tour_type) for d in documents] == [
        (Category.TOUR, "boat"),
        (Category.TOUR, "boat"),
        (Category.DO, None),
        (Category.SEE, None),
    ]
    assert documents[0].source == Source.WIKIVOYAGE  # attribution unchanged
    assert counts == {"reclassified_as_tour": 2, "reclassify_entries_missing": 1}
