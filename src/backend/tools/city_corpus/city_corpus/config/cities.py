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
class CityConfig:
    slug: str
    name: str
    language: str
    bbox: BBox
    wikivoyage: tuple[WikivoyageSite, ...]
    wikipedia_lang: str
    wikipedia_categories: tuple[str, ...]
    # OpenStreetMap area name (used by the enrichment step, TRA-139).
    osm_area: str
    districts: tuple[str, ...] = field(default_factory=tuple)


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
        "Tourist attractions in Budapest",
        "Museums in Budapest",
        # `Category:Baths in Budapest` is empty; the articles live here.
        "Thermal baths in Budapest",
        "Bridges in Budapest",
    ),
    osm_area="Budapest",
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
