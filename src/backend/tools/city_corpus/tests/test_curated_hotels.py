"""`curated/<city>/hotels.toml`: the photo a person read on the hotel's own page.

The loader is the only thing standing between a hand-written file and a build,
so it says everything that is wrong with the file at once and refuses anything
it was not asked to understand.
"""

import datetime as dt
import logging
from pathlib import Path

import pytest
from city_corpus.sources import curated_hotels

VALID = """
# Budapest — hotels no rule can picture.
# Left out: Hotel Nowhere (the page shows only the brand's logo).

[[hotel]]
match = "Hilton Budapest"
image_url = "https://hilton.com/im/en/BUDHITW/1234/exterior.jpg"
credit = "hilton.com"
source_url = "https://hilton.com/en/hotels/budhitw-hilton-budapest/"
checked = 2026-09-22
note = "Hero of the gallery; the façade from Fisherman's Bastion."

[[hotel]]
match = "osm:node/4553094489"
image_url = "https://marriott.com/photos/budmc/exterior.jpg"
credit = "marriott.com"
source_url = "https://marriott.com/hotels/travel/budmc/"
checked = 2026-09-22
"""


def _write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "hotels.toml"
    path.write_text(text, encoding="utf-8")
    return path


def test_a_missing_file_is_a_city_without_curated_photos(tmp_path: Path) -> None:
    assert curated_hotels.load(tmp_path / "hotels.toml") == []


def test_every_field_is_read_and_the_entries_are_sorted(tmp_path: Path) -> None:
    hotels = curated_hotels.load(_write(tmp_path, VALID))

    assert [h.match for h in hotels] == ["Hilton Budapest", "osm:node/4553094489"]
    first = hotels[0]
    assert first.credit == "hilton.com"
    assert first.source_url.startswith("https://hilton.com/")
    assert first.checked == dt.date(2026, 9, 22)
    assert first.note is not None
    # A name match is not an element id, and the other way round.
    assert first.osm_id is None
    assert hotels[1].osm_id == "node/4553094489"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # A key nobody reads is a fact nobody checks.
        (
            VALID.replace("note =", "photographer ="),
            "Extra inputs are not permitted",
        ),
        (
            VALID.replace("https://hilton.com/im", "hilton.com/im"),
            "must be an http(s) URL",
        ),
        (
            VALID.replace(
                'source_url = "https://hilton.com/en/hotels/budhitw-hilton-budapest/"',
                "",
                1,
            ),
            "Field required",
        ),
        (VALID.replace("checked = 2026-09-22", "checked = 2026", 1), "checked"),
    ],
)
def test_a_malformed_entry_names_itself(
    tmp_path: Path, text: str, expected: str
) -> None:
    with pytest.raises(curated_hotels.HotelDataError) as error:
        curated_hotels.load(_write(tmp_path, text))

    assert "Hilton Budapest" in str(error.value) or "#1" in str(error.value)
    assert expected in str(error.value)


def test_an_unknown_table_is_refused(tmp_path: Path) -> None:
    with pytest.raises(curated_hotels.HotelDataError, match="unknown table"):
        curated_hotels.load(_write(tmp_path, VALID + "\n[[restaurant]]\nname = 'x'\n"))


def test_a_file_that_is_not_toml_names_itself(tmp_path: Path) -> None:
    with pytest.raises(curated_hotels.HotelDataError, match=r"hotels\.toml"):
        curated_hotels.load(_write(tmp_path, "[[hotel]\nmatch = "))


SECOND_HILTON = """
[[hotel]]
match = "Hilton Budapest"
image_url = "https://hilton.com/im/en/BUDHITW/9999/lobby.jpg"
credit = "hilton.com"
source_url = "https://hilton.com/en/hotels/budhitw-hilton-budapest/"
checked = 2026-09-22
"""


def test_the_same_hotel_twice_is_refused(tmp_path: Path) -> None:
    """Which of the two is the photo? The file has to say once."""
    with pytest.raises(curated_hotels.HotelDataError, match="duplicate match"):
        curated_hotels.load(_write(tmp_path, VALID + SECOND_HILTON))


def test_every_problem_is_listed_at_once(tmp_path: Path) -> None:
    text = VALID.replace('credit = "hilton.com"', "").replace(
        'credit = "marriott.com"', ""
    )
    with pytest.raises(curated_hotels.HotelDataError) as error:
        curated_hotels.load(_write(tmp_path, text))

    assert str(error.value).count("Field required") == 2


def test_a_photo_nobody_has_looked_at_for_a_year_is_a_warning(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Never fatal: the building has not moved, and the URL either answers or
    the card hides itself."""
    hotels = curated_hotels.load(_write(tmp_path, VALID))
    today = dt.date(2026, 9, 22) + dt.timedelta(
        days=curated_hotels.STALE_AFTER_DAYS + 1
    )

    with caplog.at_level(logging.WARNING):
        stale = curated_hotels.warn_stale(hotels, today)

    assert stale == ["Hilton Budapest", "osm:node/4553094489"]
    assert "not checked for" in caplog.text
    assert curated_hotels.warn_stale(hotels, dt.date(2026, 9, 23)) == []
