"""Per-city configuration. Adding a city = one `cities/<slug>.toml` file.

The dataclasses are the in-memory form the builders read; `load_city` turns a
TOML file into one, strictly (an unknown key or a guide that is not a district
names the file and stops the build). `python -m city_corpus discover <name>`
drafts such a file from Wikidata, Wikivoyage and Wikipedia.
"""

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

CITIES_DIR = Path(__file__).resolve().parents[2] / "cities"


@dataclass(frozen=True)
class BBox:
    south: float
    west: float
    north: float
    east: float

    def contains(self, lat: float, lon: float) -> bool:
        return self.south <= lat <= self.north and self.west <= lon <= self.east


@dataclass(frozen=True)
class WikivoyageSite:
    lang: str
    # Every non-redirect article whose title is `root` or starts with `root/`.
    root: str
    include_subpages: bool = True


@dataclass(frozen=True)
class WikipediaCategory:
    """A category to read, and whether its members must be located to count.

    Broad categories (`Buildings and structures in ...`) hold embassies and
    government offices next to the sights; requiring coordinates keeps the
    unplaceable ones out without hand-listing exceptions.
    """

    name: str
    require_coordinates: bool = False


@dataclass(frozen=True)
class HeroPhoto:
    """The city's own photo, curated (TRA-182).

    `file` is a Wikimedia Commons file name without the `File:` prefix and
    `credit` the line the page prints beside it, in the same format as the
    cards' photos: `"{author} ({licence}) · Wikimedia Commons"`. `discover`
    drafts both from the city's Wikidata image (P18) after checking the
    licence on Commons; a human confirms the picture is worth showing.
    """

    file: str
    credit: str


@dataclass(frozen=True)
class CityConfig:
    slug: str
    name: str
    language: str
    bbox: BBox
    wikivoyage: tuple[WikivoyageSite, ...]
    wikipedia_lang: str
    wikipedia_categories: tuple[WikipediaCategory, ...]
    # OpenStreetMap area name: the local `name` tag of the city's admin_level=8
    # relation. Only used to select the area when `osm_relation` is unset.
    osm_area: str
    # OpenStreetMap relation id of the city (Wikidata P402): selects the area for
    # the boundaries and the place queries whatever the local name and level are.
    osm_relation: int | None = None
    # Lower-case spellings a traveller may type (en/es), read by the cities
    # manifest (TRA-167) and the planner (TRA-168).
    aliases: tuple[str, ...] = field(default_factory=tuple)
    districts: tuple[str, ...] = field(default_factory=tuple)
    # OpenStreetMap administrative level of the city's districts.
    district_admin_level: int = 9
    # District `ref` → the Wikivoyage guide(s) covering it. A district split between
    # several guides is resolved by the nearest Wikivoyage listing of those guides.
    district_guides: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # Point for climate normals (city centre).
    centre: tuple[float, float] = (0.0, 0.0)
    timezone: str = "UTC"
    # Curated tours file, relative to the tool's folder; `curated/<slug>/tours.toml`
    # when unset.
    curated_tours: str | None = None
    # The city's photo, read by the cities manifest (TRA-182). Optional: the
    # readiness gate does not ask for one.
    hero: HeroPhoto | None = None


class CityConfigError(ValueError):
    """The TOML file cannot be read as a `CityConfig`; the message names the file."""


_TOP_LEVEL_KEYS = {
    "slug",
    "name",
    "aliases",
    "language",
    "bbox",
    "wikivoyage",
    "wikipedia",
    "wikipedia_lang",
    "osm_area",
    "osm_relation",
    "districts",
    "district_admin_level",
    "district_guides",
    "centre",
    "timezone",
    "curated_tours",
    "hero",
}
_REQUIRED_KEYS = {
    "slug",
    "name",
    "language",
    "bbox",
    "wikivoyage",
    "wikipedia",
    "wikipedia_lang",
    "osm_area",
}


def _check_keys(where: str, table: dict[str, Any], allowed: set[str]) -> None:
    unknown = sorted(set(table) - allowed)
    if unknown:
        raise CityConfigError(f"{where}: unknown key(s) {', '.join(unknown)}")


def _strings(where: str, values: Any) -> tuple[str, ...]:
    if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
        raise CityConfigError(f"{where}: expected a list of strings")
    return tuple(values)


def parse_city(data: dict[str, Any], where: str = "<city>") -> CityConfig:
    """Build a `CityConfig` from a parsed TOML document, rejecting what it cannot use."""
    _check_keys(where, data, _TOP_LEVEL_KEYS)
    missing = sorted(_REQUIRED_KEYS - set(data))
    if missing:
        raise CityConfigError(f"{where}: missing key(s) {', '.join(missing)}")

    bbox_table = data["bbox"]
    _check_keys(f"{where} [bbox]", bbox_table, {"south", "west", "north", "east"})
    try:
        bbox = BBox(
            **{k: float(bbox_table[k]) for k in ("south", "west", "north", "east")}
        )
    except KeyError as exc:
        raise CityConfigError(f"{where} [bbox]: missing {exc.args[0]}") from exc

    sites: list[WikivoyageSite] = []
    for index, site in enumerate(data["wikivoyage"]):
        _check_keys(
            f"{where} [[wikivoyage]] #{index + 1}",
            site,
            {"lang", "root", "include_subpages"},
        )
        sites.append(
            WikivoyageSite(
                lang=site["lang"],
                root=site["root"],
                include_subpages=bool(site.get("include_subpages", True)),
            )
        )

    wikipedia = data["wikipedia"]
    _check_keys(f"{where} [wikipedia]", wikipedia, {"categories"})
    categories: list[WikipediaCategory] = []
    for index, category in enumerate(wikipedia.get("categories", [])):
        _check_keys(
            f"{where} [[wikipedia.categories]] #{index + 1}",
            category,
            {"name", "require_coordinates"},
        )
        categories.append(
            WikipediaCategory(
                name=category["name"],
                require_coordinates=bool(category.get("require_coordinates", False)),
            )
        )

    districts = _strings(f"{where} districts", data.get("districts", []))
    guides: dict[str, tuple[str, ...]] = {}
    for ref, names in data.get("district_guides", {}).items():
        guides[str(ref)] = _strings(f"{where} [district_guides] {ref}", names)
        unknown = sorted(set(guides[str(ref)]) - set(districts))
        if unknown:
            raise CityConfigError(
                f"{where} [district_guides] {ref}: {', '.join(unknown)} not in districts"
            )

    relation = data.get("osm_relation")
    if relation is not None and (
        isinstance(relation, bool) or not isinstance(relation, int) or relation <= 0
    ):
        raise CityConfigError(f"{where} osm_relation: expected a positive integer")

    curated_tours = data.get("curated_tours")
    if curated_tours is not None:
        parts = Path(str(curated_tours)).parts
        if Path(str(curated_tours)).is_absolute() or ".." in parts:
            raise CityConfigError(
                f"{where} curated_tours: must be a path inside the tool folder"
            )

    hero = None
    hero_table = data.get("hero")
    if hero_table is not None:
        _check_keys(f"{where} [hero]", hero_table, {"file", "credit"})
        missing_hero = sorted({"file", "credit"} - set(hero_table))
        if missing_hero:
            raise CityConfigError(
                f"{where} [hero]: missing key(s) {', '.join(missing_hero)}"
            )
        file_name = str(hero_table["file"]).strip()
        credit = str(hero_table["credit"]).strip()
        # Both empty is a draft `discover` wrote and nobody has reviewed yet;
        # one of the two is a photo without its credit, which the licence of a
        # Commons file does not allow.
        if bool(file_name) != bool(credit):
            raise CityConfigError(
                f"{where} [hero]: file and credit go together; fill both "
                "(or leave both empty in a draft)"
            )
        hero = HeroPhoto(file=file_name, credit=credit)

    centre_values = data.get("centre", [0.0, 0.0])
    if not isinstance(centre_values, list) or len(centre_values) != 2:
        raise CityConfigError(f"{where} centre: expected [lat, lon]")
    centre = (float(centre_values[0]), float(centre_values[1]))

    return CityConfig(
        slug=data["slug"],
        name=data["name"],
        language=data["language"],
        bbox=bbox,
        wikivoyage=tuple(sites),
        wikipedia_lang=data["wikipedia_lang"],
        wikipedia_categories=tuple(categories),
        osm_area=data["osm_area"],
        osm_relation=relation,
        aliases=_strings(f"{where} aliases", data.get("aliases", [])),
        districts=districts,
        district_admin_level=int(data.get("district_admin_level", 9)),
        district_guides=guides,
        centre=centre,
        timezone=data.get("timezone", "UTC"),
        curated_tours=curated_tours,
        hero=hero,
    )


def load_city(path: Path) -> CityConfig:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise CityConfigError(f"{path}: {exc}") from exc
    city = parse_city(data, str(path))
    if city.slug != path.stem:
        raise CityConfigError(
            f"{path}: slug {city.slug!r} does not match the file name"
        )
    return city


def load_cities(folder: Path = CITIES_DIR) -> dict[str, CityConfig]:
    """Every `<slug>.toml` in the folder; drafts (`<slug>.draft.toml`) are skipped."""
    cities: dict[str, CityConfig] = {}
    for path in sorted(folder.glob("*.toml")):
        if path.name.endswith(".draft.toml"):
            continue
        city = load_city(path)
        cities[city.slug] = city
    return cities


CITIES: dict[str, CityConfig] = load_cities()
# The reference city; the tests parse its fixtures against this configuration.
BUDAPEST = CITIES["budapest"]
