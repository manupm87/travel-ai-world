"""The readiness gate: what a city corpus must hold before it is indexed.

One place for every threshold (TRA-166). `report.gate` measures a corpus against
them; `python -m city_corpus report <slug>` fails when any is missed. Budapest,
the reference city, clears every one with room, so a new city that does not is
short of sources, not of luck: more Wikipedia categories, a wider bbox, a lower
district admin level.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Thresholds:
    # `see` + `history` + `do` listings with coordinates: what fills the days.
    located_sights: int = 150
    # `eat` listings with coordinates: lunch and dinner near the day's route.
    located_eat: int = 100
    # `sleep` documents, and how many of them the hotel step can place on a map.
    sleep: int = 20
    located_sleep: int = 10
    # Located `sleep` places with an `image_url`. A stay is never offered
    # without a photo (ADR 0022), so an unpictured hotel is not a hotel.
    pictured_sleep: int = 10
    # Distinct districts: the neighbourhood carousel offers three.
    districts: int = 5
    # Districts with a `neighbourhood` document: what the carousel ranks. A
    # Wikivoyage district page, or the district's Wikipedia article.
    described_districts: int = 5
    # Share of `see` + `history` listings with an `image_url`: cards need photos.
    pictured_sights_share: float = 0.5
    # Monthly climate normals (`om:climate:<slug>:MM`): one per month.
    climate_normals: int = 12
    # Curated tours (`curated/<slug>/tours.toml`, source `curated`) and `tour`
    # documents of any source. Tours are not optional: every city ships the
    # free walking tours and the notable paid ones, read on the operators' sites.
    curated_tours: int = 3
    tour_documents: int = 3


DEFAULT_THRESHOLDS = Thresholds()
