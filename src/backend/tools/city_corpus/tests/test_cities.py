import re
from pathlib import Path

import pytest
from city_corpus.config.cities import (
    BUDAPEST,
    CITIES,
    CITIES_DIR,
    CityConfigError,
    load_cities,
    load_city,
)

MINIMAL = """
slug = "testville"
name = "Testville"
language = "en"
wikipedia_lang = "en"
osm_area = "Testville"
districts = ["Old Town"]

[bbox]
south = 1.0
west = 2.0
north = 3.0
east = 4.0

[[wikivoyage]]
lang = "en"
root = "Testville"

[[wikipedia.categories]]
name = "Museums in Testville"
require_coordinates = true

[district_guides]
"1" = ["Old Town"]
"""


def _top(text: str, line: str) -> str:
    """`line` added to the top-level keys (before the first table)."""
    return text.replace(
        'districts = ["Old Town"]\n', f'districts = ["Old Town"]\n{line}\n'
    )


def _write(tmp_path: Path, text: str, name: str = "testville.toml") -> Path:
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


def test_budapest_loads_from_its_toml() -> None:
    assert CITIES_DIR.name == "cities"
    assert CITIES["budapest"] is BUDAPEST
    assert BUDAPEST.aliases == ("budapest",)
    assert BUDAPEST.bbox.contains(47.4979, 19.0402)
    assert len(BUDAPEST.districts) == 20
    assert BUDAPEST.district_guides["1"] == ("Budavár", "Víziváros")
    assert len(BUDAPEST.district_guides) == 23
    assert [s.lang for s in BUDAPEST.wikivoyage] == ["en", "es"]
    assert BUDAPEST.wikivoyage[1].include_subpages is False
    located = [c.name for c in BUDAPEST.wikipedia_categories if c.require_coordinates]
    assert located == ["Buildings and structures in Budapest"]
    assert BUDAPEST.timezone == "Europe/Budapest"
    assert BUDAPEST.curated_tours is None
    assert BUDAPEST.hero is not None
    assert BUDAPEST.hero.file.endswith(".jpg")
    assert BUDAPEST.hero.credit.endswith("· Wikimedia Commons")


def test_minimal_file_fills_defaults(tmp_path: Path) -> None:
    city = load_city(_write(tmp_path, MINIMAL))
    assert city.slug == "testville"
    assert city.aliases == ()
    assert city.district_admin_level == 9
    assert city.centre == (0.0, 0.0)
    assert city.timezone == "UTC"
    assert city.wikivoyage[0].include_subpages is True
    assert city.wikipedia_categories[0].require_coordinates is True
    assert city.district_guides == {"1": ("Old Town",)}
    assert city.hero is None  # the photo is optional; the gate does not ask for one


HERO = '\n[hero]\nfile = "Old Town.jpg"\ncredit = "A. Photographer (CC BY-SA 4.0)"\n'


def test_the_hero_photo_is_read_from_its_table(tmp_path: Path) -> None:
    city = load_city(_write(tmp_path, MINIMAL + HERO))
    assert city.hero is not None
    assert city.hero.file == "Old Town.jpg"
    assert city.hero.credit == "A. Photographer (CC BY-SA 4.0)"


def test_the_hero_table_is_read_strictly(tmp_path: Path) -> None:
    with pytest.raises(CityConfigError, match=re.escape("[hero]: unknown key(s) url")):
        load_city(_write(tmp_path, MINIMAL + HERO + 'url = "https://example.org"\n'))
    with pytest.raises(CityConfigError, match=re.escape("[hero]: missing key(s)")):
        load_city(_write(tmp_path, MINIMAL + '\n[hero]\nfile = "Old Town.jpg"\n'))


def test_a_hero_photo_needs_its_credit(tmp_path: Path) -> None:
    """A half-reviewed draft: a Commons file always travels with its credit."""
    halves = (
        '\n[hero]\nfile = "Old Town.jpg"\ncredit = ""\n',
        '\n[hero]\nfile = ""\ncredit = "A. Photographer (CC BY-SA 4.0)"\n',
    )
    for text in halves:
        with pytest.raises(CityConfigError, match="file and credit go together"):
            load_city(_write(tmp_path, MINIMAL + text))

    # Both empty is what `discover` writes when it found no free image.
    city = load_city(_write(tmp_path, MINIMAL + '\n[hero]\nfile = ""\ncredit = ""\n'))
    assert city.hero is not None and city.hero.file == ""


def test_drafts_are_skipped_and_slugs_keyed(tmp_path: Path) -> None:
    _write(tmp_path, MINIMAL)
    _write(tmp_path, MINIMAL, "testville.draft.toml")
    assert list(load_cities(tmp_path)) == ["testville"]


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (("districts = ", "district = "), "unknown key(s) district"),
        (("\n[bbox]\nsouth = 1.0\n", "\n[bbox]\n"), "[bbox]: missing south"),
        (('"1" = ["Old Town"]', '"1" = ["Nowhere"]'), "Nowhere not in districts"),
        (('"1" = ["Old Town"]', '"1" = "Old Town"'), "expected a list of strings"),
        (("require_coordinates = true", "coordinates = true"), "unknown key(s)"),
        (('slug = "testville"', 'slug = "other"'), "does not match the file name"),
    ],
)
def test_strict_loading(tmp_path: Path, change: tuple[str, str], message: str) -> None:
    old, new = change
    assert old in MINIMAL
    with pytest.raises(CityConfigError, match=re.escape(message)) as excinfo:
        load_city(_write(tmp_path, MINIMAL.replace(old, new)))
    assert "testville.toml" in str(excinfo.value)


def test_missing_required_key_is_named(tmp_path: Path) -> None:
    with pytest.raises(CityConfigError, match="missing key\\(s\\) osm_area"):
        load_city(_write(tmp_path, MINIMAL.replace('osm_area = "Testville"\n', "")))


def test_osm_relation_is_a_positive_integer(tmp_path: Path) -> None:
    city = load_city(_write(tmp_path, _top(MINIMAL, "osm_relation = 43172")))
    assert city.osm_relation == 43172
    with pytest.raises(CityConfigError, match="osm_relation: expected a positive"):
        load_city(_write(tmp_path, _top(MINIMAL, 'osm_relation = "43172"')))


def test_curated_tours_stays_inside_the_tool_folder(tmp_path: Path) -> None:
    city = load_city(
        _write(tmp_path, _top(MINIMAL, 'curated_tours = "curated/x/t.toml"'))
    )
    assert city.curated_tours == "curated/x/t.toml"
    for value in ("/etc/tours.toml", "../tours.toml", "curated/../../t.toml"):
        with pytest.raises(CityConfigError, match="inside the tool folder"):
            load_city(_write(tmp_path, _top(MINIMAL, f'curated_tours = "{value}"')))
