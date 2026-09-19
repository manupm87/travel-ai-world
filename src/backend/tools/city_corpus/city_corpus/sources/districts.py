"""District assignment: OpenStreetMap boundaries → Wikivoyage district guide names."""

import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from shapely import Point, prepare
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import polygonize, unary_union

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient, Fetched

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
FALLBACK_MAX_M = 1000.0
METRES_PER_DEGREE = 111_320.0


@dataclass(frozen=True)
class Boundary:
    ref: str
    name: str
    shape: BaseGeometry


def area_selector(city: CityConfig) -> str:
    return f'area["name"="{city.osm_area}"]["admin_level"="8"]->.a;'


def fetch_boundaries(client: ApiClient, city: CityConfig) -> Fetched:
    query = (
        f"[out:json][timeout:180];{area_selector(city)}"
        f'relation["boundary"="administrative"]'
        f'["admin_level"="{city.district_admin_level}"](area.a);out geom;'
    )
    return client.post_form(OVERPASS_URL, {"data": query})


def parse_boundaries(overpass: dict[str, Any]) -> list[Boundary]:
    """Polygons from each relation's outer ways (`out geom` output)."""
    boundaries: list[Boundary] = []
    for element in overpass.get("elements", []):
        if element.get("type") != "relation":
            continue
        tags = element.get("tags", {})
        lines = [
            LineString([(p["lon"], p["lat"]) for p in member["geometry"]])
            for member in element.get("members", [])
            if member.get("type") == "way"
            and member.get("role", "outer") in ("outer", "")
            and len(member.get("geometry") or []) >= 2
        ]
        polygons = list(polygonize(lines))
        # Districts are keyed by their `ref` (Budapest's kerület numbers); a city
        # whose boundaries carry none is keyed by name.
        ref = tags.get("ref") or tags.get("name")
        if not polygons or not ref:
            continue
        shape = unary_union(polygons)
        if not isinstance(shape, Polygon | MultiPolygon):
            continue
        boundaries.append(
            Boundary(ref=str(ref), name=tags.get("name", ""), shape=shape)
        )
    return sorted(
        boundaries, key=lambda b: (int(b.ref) if b.ref.isdigit() else 0, b.ref)
    )


class DistrictLocator:
    """Point → Wikivoyage guide name. `anchors` are (guide, lat, lon) of existing
    Wikivoyage listings, used to split districts that belong to several guides."""

    def __init__(
        self,
        boundaries: list[Boundary],
        guides: dict[str, tuple[str, ...]],
        anchors: Iterable[tuple[str, float, float]] = (),
    ) -> None:
        self._boundaries = [b for b in boundaries if b.ref in guides]
        for boundary in self._boundaries:
            prepare(boundary.shape)
        self._guides = guides
        self._anchors: dict[str, list[tuple[float, float]]] = {}
        for guide, lat, lon in anchors:
            self._anchors.setdefault(guide, []).append((lat, lon))

    def __bool__(self) -> bool:
        return bool(self._boundaries)

    def locate(self, lat: float, lon: float) -> str | None:
        point = Point(lon, lat)
        for boundary in self._boundaries:
            if boundary.shape.covers(point):
                return self._guide(self._guides[boundary.ref], lat, lon)
        # Gaps between boundaries (Margaret Island is in no district relation):
        # the guide of the nearest Wikivoyage listing, if one is close enough.
        nearest = self._nearest(tuple(self._anchors), lat, lon)
        if nearest and nearest[0] <= FALLBACK_MAX_M:
            return nearest[1]
        return None

    def _guide(self, candidates: tuple[str, ...], lat: float, lon: float) -> str:
        if len(candidates) == 1:
            return candidates[0]
        nearest = self._nearest(candidates, lat, lon)
        return nearest[1] if nearest else candidates[0]

    def _nearest(
        self, guides: tuple[str, ...], lat: float, lon: float
    ) -> tuple[float, str] | None:
        """(approximate distance in metres, guide) of the closest anchor."""
        scale = math.cos(math.radians(lat))
        best: tuple[float, str] | None = None
        for guide in sorted(guides):
            for a_lat, a_lon in self._anchors.get(guide, []):
                squared = (a_lat - lat) ** 2 + ((a_lon - lon) * scale) ** 2
                if best is None or squared < best[0]:
                    best = (squared, guide)
        return (math.sqrt(best[0]) * METRES_PER_DEGREE, best[1]) if best else None
