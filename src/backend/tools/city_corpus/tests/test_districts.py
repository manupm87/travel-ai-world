from dataclasses import replace
from typing import Any

from city_corpus.config.cities import BUDAPEST
from city_corpus.sources.districts import (
    DistrictLocator,
    area_selector,
    parse_boundaries,
)


def _square_relation(
    ref: str, west: float, south: float, size: float
) -> dict[str, Any]:
    """A square district drawn with two open ways, as Overpass `out geom` returns."""
    east, north = west + size, south + size
    return {
        "type": "relation",
        "id": int(ref),
        "tags": {"ref": ref, "name": f"{ref}. kerület"},
        "members": [
            {
                "type": "way",
                "role": "outer",
                "geometry": [
                    {"lat": south, "lon": west},
                    {"lat": south, "lon": east},
                    {"lat": north, "lon": east},
                ],
            },
            {
                "type": "way",
                "role": "outer",
                "geometry": [
                    {"lat": north, "lon": east},
                    {"lat": north, "lon": west},
                    {"lat": south, "lon": west},
                ],
            },
            {"type": "node", "role": "label", "lat": south, "lon": west},
        ],
    }


# District 1 (west square) is split between two guides; district 2 (east) is not.
OVERPASS = {
    "elements": [
        _square_relation("2", 19.10, 47.40, 0.05),
        _square_relation("1", 19.00, 47.40, 0.05),
    ]
}
GUIDES = {"1": ("Budavár", "Víziváros"), "2": ("Belváros",)}
ANCHORS = [
    ("Budavár", 47.41, 19.01),
    ("Víziváros", 47.44, 19.04),
    ("Belváros", 47.42, 19.12),
]


def test_boundaries_are_assembled_from_ways() -> None:
    boundaries = parse_boundaries(OVERPASS)
    assert [b.ref for b in boundaries] == ["1", "2"]
    assert all(b.shape.is_valid and b.shape.area > 0 for b in boundaries)


def test_boundary_without_ref_is_keyed_by_name() -> None:
    relation = _square_relation("3", 19.20, 47.40, 0.05)
    relation["tags"] = {"name": "Savena"}
    nameless = _square_relation("4", 19.30, 47.40, 0.05)
    nameless["tags"] = {}
    [boundary] = parse_boundaries({"elements": [relation, nameless]})
    assert (boundary.ref, boundary.name) == ("Savena", "Savena")


def test_point_in_polygon_and_split_by_nearest_listing() -> None:
    locator = DistrictLocator(parse_boundaries(OVERPASS), GUIDES, ANCHORS)
    assert locator.locate(47.42, 19.12) == "Belváros"
    assert locator.locate(47.411, 19.011) == "Budavár"
    assert locator.locate(47.439, 19.039) == "Víziváros"


def test_gaps_fall_back_to_a_nearby_listing_only() -> None:
    locator = DistrictLocator(parse_boundaries(OVERPASS), GUIDES, ANCHORS)
    # Between the squares (lon 19.05-19.10), ~450 m from the Víziváros anchor.
    assert locator.locate(47.44, 19.046) == "Víziváros"
    # Far outside everything.
    assert locator.locate(47.60, 19.30) is None


def test_area_is_selected_by_relation_id_when_configured() -> None:
    # Budapest keeps the name query: its Overpass cache keys must not change.
    assert area_selector(BUDAPEST) == 'area["name"="Budapest"]["admin_level"="8"]->.a;'
    vienna = replace(BUDAPEST, osm_area="Wien", osm_relation=109166)
    assert area_selector(vienna) == "area(id:3600109166)->.a;"
