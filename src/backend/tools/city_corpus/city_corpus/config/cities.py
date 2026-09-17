"""Per-city configuration. Adding a city = one `CityConfig` in `CITIES`."""

from dataclasses import dataclass, field


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
class CityConfig:
    slug: str
    name: str
    language: str
    bbox: BBox
    wikivoyage: tuple[WikivoyageSite, ...]
    wikipedia_lang: str
    wikipedia_categories: tuple[WikipediaCategory, ...]
    # OpenStreetMap area name (used by the enrichment step, TRA-139).
    osm_area: str
    districts: tuple[str, ...] = field(default_factory=tuple)
    # OpenStreetMap administrative level of the city's districts.
    district_admin_level: int = 9
    # District `ref` → the Wikivoyage guide(s) covering it. A district split between
    # several guides is resolved by the nearest Wikivoyage listing of those guides.
    district_guides: dict[str, tuple[str, ...]] = field(default_factory=dict)
    # Point for climate normals (city centre).
    centre: tuple[float, float] = (0.0, 0.0)
    timezone: str = "UTC"


BUDAPEST = CityConfig(
    slug="budapest",
    name="Budapest",
    language="en",
    bbox=BBox(south=47.34, west=18.92, north=47.62, east=19.34),
    wikivoyage=(
        WikivoyageSite(lang="en", root="Budapest", include_subpages=True),
        WikivoyageSite(lang="es", root="Budapest", include_subpages=False),
    ),
    wikipedia_lang="en",
    wikipedia_categories=(
        WikipediaCategory("Tourist attractions in Budapest"),
        WikipediaCategory("Museums in Budapest"),
        # `Category:Baths in Budapest` is empty; the articles live here.
        WikipediaCategory("Thermal baths in Budapest"),
        WikipediaCategory("Bridges in Budapest"),
        # TRA-157. City-scoped only: `Landmarks in Hungary` and `Castles in
        # Hungary` would add 46 articles, most of them outside the city.
        WikipediaCategory(
            "Buildings and structures in Budapest", require_coordinates=True
        ),
        WikipediaCategory("Squares in Budapest"),
        WikipediaCategory("Churches in Budapest"),
        WikipediaCategory("Monuments and memorials in Budapest"),
        WikipediaCategory("Synagogues in Budapest"),
        WikipediaCategory("Parks in Budapest"),
    ),
    osm_area="Budapest",
    centre=(47.4979, 19.0402),
    timezone="Europe/Budapest",
    # From the Districts section of en.wikivoyage.org/wiki/Budapest.
    district_guides={
        "1": ("Budavár", "Víziváros"),
        "2": ("North Buda",),
        "3": ("Óbuda", "Aquincum"),
        "4": ("North Pest",),
        "5": ("Belváros",),
        "6": ("Terézváros",),
        "7": ("Erzsébetváros",),
        "8": ("Józsefváros",),
        "9": ("Ferencváros",),
        "10": ("Kőbánya",),
        "11": ("South Buda",),
        "12": ("Hegyvidék",),
        "13": ("Angyalföld",),
        "14": ("Városliget", "Zugló"),
        "15": ("North Pest",),
        "16": ("East Pest",),
        "17": ("East Pest",),
        "18": ("South Pest",),
        "19": ("South Pest",),
        "20": ("South Pest",),
        "21": ("Csepel",),
        "22": ("South Buda",),
        "23": ("South Pest",),
    },
    districts=(
        "Angyalföld",
        "Aquincum",
        "Belváros",
        "Budavár",
        "Csepel",
        "East Pest",
        "Erzsébetváros",
        "Ferencváros",
        "Hegyvidék",
        "Józsefváros",
        "Kőbánya",
        "North Buda",
        "North Pest",
        "South Buda",
        "South Pest",
        "Terézváros",
        "Városliget",
        "Víziváros",
        "Zugló",
        "Óbuda",
    ),
)

CITIES: dict[str, CityConfig] = {c.slug: c for c in (BUDAPEST,)}
