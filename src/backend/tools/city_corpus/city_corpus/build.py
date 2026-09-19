"""Build a city's corpus: fetch, parse, enrich, validate, write JSONL + manifest."""

import datetime as dt
import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient
from city_corpus.models import (
    CC_BY,
    CC_BY_SA,
    ODBL,
    Category,
    CorpusDocument,
    Kind,
    Source,
)
from city_corpus.sources import (
    climate,
    districts,
    osm,
    tours,
    wikidata,
    wikipedia,
    wikivoyage,
)

logger = logging.getLogger(__name__)


class Stage(StrEnum):
    WIKIVOYAGE = "wikivoyage"
    WIKIPEDIA = "wikipedia"
    OPENSTREETMAP = "openstreetmap"  # also district boundaries
    WIKIDATA = "wikidata"  # and Commons image licences
    CLIMATE = "climate"
    TOURS = "tours"  # curated/<city>/tours.toml


MIN_TEXT_CHARS = 40
ALL_STAGES = tuple(Stage)
LICENCES = {
    Source.WIKIVOYAGE: CC_BY_SA,
    Source.WIKIPEDIA: CC_BY_SA,
    Source.OPENSTREETMAP: ODBL,
    Source.OPEN_METEO: CC_BY,
    Source.CURATED: CC_BY_SA,
}
CURATED_DIR = Path(__file__).resolve().parents[1] / "curated"
# Always present in each JSONL line (null when unknown): the ADR 0012 payload schema.
# Listing extras and enrichment fields are written only when they have a value.
PAYLOAD_FIELDS = {
    "doc_id",
    "city",
    "district",
    "category",
    "kind",
    "name",
    "text",
    "heading_path",
    "lat",
    "lon",
    "hours",
    "price",
    "price_tier",
    "url",
    "image_url",
    "wikidata",
    "source",
    "source_url",
    "license",
    "lang",
}


class CorpusValidationError(ValueError):
    def __init__(self, problems: list[str]) -> None:
        self.problems = problems
        shown = "\n  ".join(problems[:20])
        more = f"\n  ... and {len(problems) - 20} more" if len(problems) > 20 else ""
        super().__init__(f"{len(problems)} invalid documents:\n  {shown}{more}")


@dataclass
class BuildResult:
    documents: list[CorpusDocument]
    revisions: dict[str, int] = field(default_factory=dict)
    fetched_at: list[str] = field(default_factory=list)
    coordinates_outside_bbox: int = 0
    listings_skipped: int = 0
    # Enrichment counters, reported under `enrichment` in the manifest.
    enrichment: dict[str, Any] = field(default_factory=dict)


def collect(
    city: CityConfig,
    client: ApiClient,
    stages: tuple[Stage, ...] = ALL_STAGES,
    curated_dir: Path = CURATED_DIR,
) -> BuildResult:
    result = BuildResult(documents=[])
    if Stage.WIKIVOYAGE in stages:
        _collect_wikivoyage(city, client, result)
    if Stage.WIKIPEDIA in stages:
        _collect_wikipedia(city, client, result)
    locator = None
    if Stage.OPENSTREETMAP in stages:
        locator = _collect_osm(city, client, result)
    if Stage.WIKIDATA in stages:
        _enrich_wikidata(city, client, result)
    if locator:
        _assign_districts(result, locator)
    if Stage.CLIMATE in stages:
        fetched = climate.fetch(client, city)
        result.fetched_at.append(fetched.fetched_at)
        result.documents += climate.documents(climate.aggregate(fetched.data), city)
    if Stage.TOURS in stages:
        tours_file = (
            curated_dir.parent / city.curated_tours
            if city.curated_tours
            else curated_dir / city.slug / "tours.toml"
        )
        curated = tours.load(tours_file, city)
        tours.warn_stale(curated.tours, dt.date.today())
        result.enrichment["tours"] = {
            "curated": len(curated.tours),
            **tours.reclassify(result.documents, curated.reclassify),
        }
        result.documents += tours.documents(curated.tours, city, locator)
    return result


def _collect_wikivoyage(
    city: CityConfig, client: ApiClient, result: BuildResult
) -> None:
    stats = wikivoyage.ParseStats()
    for site in city.wikivoyage:
        for title in wikivoyage.list_titles(client, site):
            page, fetched_at = wikivoyage.fetch_page(client, site.lang, title)
            logger.info(
                "wikivoyage:%s:%s rev %d", page.lang, page.title, page.revision_id
            )
            result.revisions[f"wikivoyage:{page.lang}:{page.title}"] = page.revision_id
            result.fetched_at.append(fetched_at)
            result.documents += wikivoyage.parse_page(page, city, stats)
    result.coordinates_outside_bbox += stats.coordinates_outside_bbox
    result.listings_skipped += stats.listings_skipped


def _collect_wikipedia(
    city: CityConfig, client: ApiClient, result: BuildResult
) -> None:
    lang = city.wikipedia_lang
    # A page can sit in several categories: it is admitted unqualified as soon as
    # one category asks for no coordinates.
    needs_coordinates: dict[int, bool] = {}
    first_category: dict[int, str] = {}
    for category in city.wikipedia_categories:
        members = wikipedia.category_members(client, lang, category.name)
        if not members:
            logger.warning("Category:%s has no articles", category.name)
        for page_id in members:
            first_category.setdefault(page_id, category.name)
            needs_coordinates[page_id] = (
                needs_coordinates.get(page_id, True) and category.require_coordinates
            )

    per_category: Counter[str] = Counter()
    skipped: Counter[str] = Counter()
    for page_id in sorted(needs_coordinates):
        article, fetched_at = wikipedia.fetch_article(client, lang, page_id)
        result.fetched_at.append(fetched_at)
        category_name = first_category[page_id]
        if needs_coordinates[page_id] and not wikipedia.is_located(article, city):
            logger.info("skipping %s: no coordinates in the city", article.title)
            skipped[category_name] += 1
            continue
        logger.info("wikipedia:%s:%s rev %d", lang, article.title, article.revision_id)
        result.revisions[f"wikipedia:{lang}:{article.title}"] = article.revision_id
        documents = wikipedia.parse_article(article, city)
        per_category[category_name] += len(documents)
        result.documents += documents
    result.enrichment["wikipedia"] = {
        "articles": len(needs_coordinates) - sum(skipped.values()),
        "documents_per_category": dict(sorted(per_category.items())),
        "skipped_without_coordinates": dict(sorted(skipped.items())),
    }


def _collect_osm(
    city: CityConfig, client: ApiClient, result: BuildResult
) -> districts.DistrictLocator:
    boundaries_response = districts.fetch_boundaries(client, city)
    result.fetched_at.append(boundaries_response.fetched_at)
    boundaries = districts.parse_boundaries(boundaries_response.data)
    anchors = [
        (d.district, d.lat, d.lon)
        for d in result.documents
        if d.source == Source.WIKIVOYAGE
        and d.kind == Kind.LISTING
        and d.district
        and d.lat is not None
        and d.lon is not None
    ]
    locator = districts.DistrictLocator(boundaries, city.district_guides, anchors)
    missing = sorted(set(city.district_guides) - {b.ref for b in boundaries})
    if missing:
        logger.warning("no OSM boundary for districts %s", ", ".join(missing))

    links = osm.fetch_wikidata_links(client, city)
    result.fetched_at.append(links.fetched_at)
    linked = osm.link_wikidata(result.documents, links.data)

    stats = osm.OsmStats()
    responses = osm.fetch(client, city)
    result.fetched_at += [fetched.fetched_at for _, fetched in responses]
    found = osm.places(((q, f.data) for q, f in responses), city, stats)
    result.documents += osm.merge(result.documents, found, city, locator, stats)
    result.enrichment["openstreetmap"] = {
        "as_of": stats.timestamp,
        "district_boundaries": len(boundaries),
        "documents_linked_to_wikidata": linked,
        "elements": stats.elements,
        "candidates": stats.candidates,
        "merged_into_existing": stats.merged,
        "new_documents": stats.new,
        "outside_bbox": stats.outside_bbox,
        "skipped_too_short": stats.too_short,
    }
    return locator


def _enrich_wikidata(city: CityConfig, client: ApiClient, result: BuildResult) -> None:
    stats = wikidata.WikidataStats()
    qids = {d.wikidata for d in result.documents if d.wikidata}
    entities = wikidata.fetch_entities(client, qids)
    heritage_ids = {h for e in entities.values() for h in e.heritage_ids}
    heritage_labels = wikidata.fetch_labels(client, heritage_ids)
    files = {
        f for d in result.documents for f in wikidata.image_candidates(d, entities)
    }
    images = wikidata.fetch_image_info(client, files)
    result.documents = [
        wikidata.enrich(d, city, entities, heritage_labels, images, stats)
        for d in result.documents
    ]
    free = sum(1 for info in images.values() if info and wikidata.is_free(info.licence))
    result.enrichment["wikidata"] = {
        "ids": len(qids),
        "entities": len({e.qid for e in entities.values()}),
        "image_files_checked": len(files),
        "image_files_free": free,
        "document_images_skipped_non_free": stats.images_non_free,
    }


def _assign_districts(result: BuildResult, locator: districts.DistrictLocator) -> None:
    assigned = 0
    for index, doc in enumerate(result.documents):
        if doc.district is None and doc.lat is not None and doc.lon is not None:
            district = locator.locate(doc.lat, doc.lon)
            if district:
                result.documents[index] = doc.model_copy(update={"district": district})
                assigned += 1
    result.enrichment["districts_assigned_by_boundary"] = assigned


def validate(documents: list[CorpusDocument], city: CityConfig) -> list[str]:
    problems: list[str] = []
    ids = Counter(d.doc_id for d in documents)
    problems += [f"duplicate doc_id {i!r} ({n}x)" for i, n in ids.items() if n > 1]
    for doc in documents:
        where = doc.doc_id or "<empty doc_id>"
        if not doc.doc_id.strip():
            problems.append(f"{where}: empty doc_id")
        if len(doc.text.strip()) < MIN_TEXT_CHARS:
            problems.append(f"{where}: text shorter than {MIN_TEXT_CHARS} chars")
        if doc.city != city.slug:
            problems.append(f"{where}: city {doc.city!r} is not {city.slug!r}")
        if doc.category not in set(Category):
            problems.append(f"{where}: category {doc.category!r} not in the enum")
        if (doc.lat is None) != (doc.lon is None):
            problems.append(f"{where}: lat/lon must be both set or both null")
        elif (
            doc.lat is not None
            and doc.lon is not None
            and not city.bbox.contains(doc.lat, doc.lon)
        ):
            problems.append(f"{where}: ({doc.lat}, {doc.lon}) outside the city bbox")
        if doc.license != LICENCES[doc.source]:
            problems.append(f"{where}: license {doc.license!r} for {doc.source.value}")
        if doc.price_tier is not None and doc.price_tier not in (1, 2, 3):
            problems.append(f"{where}: price_tier {doc.price_tier} not in 1-3")
    return problems


def to_json_line(doc: CorpusDocument) -> str:
    data: dict[str, Any] = doc.model_dump(mode="json")
    data = {k: v for k, v in data.items() if k in PAYLOAD_FIELDS or v is not None}
    return json.dumps(data, ensure_ascii=False)


def manifest(city: CityConfig, result: BuildResult) -> dict[str, Any]:
    docs = result.documents
    listings = [d for d in docs if d.kind == Kind.LISTING]
    see = [d for d in docs if d.category == Category.SEE]
    see_with_image = sum(1 for d in see if d.image_url)

    def counts(values: list[str]) -> dict[str, int]:
        return dict(sorted(Counter(values).items()))

    wikivoyage_districts = {
        d.district for d in docs if d.source == Source.WIKIVOYAGE and d.district
    }
    return {
        "city": city.slug,
        "built_at": max(result.fetched_at, default=None),
        "documents": len(docs),
        "listings": len(listings),
        "listings_with_coordinates": sum(1 for d in listings if d.lat is not None),
        "by_source": counts([d.source.value for d in docs]),
        "by_lang": counts([d.lang for d in docs]),
        "by_kind": counts([d.kind.value for d in docs]),
        "by_category": counts([d.category.value for d in docs]),
        "by_district": counts([d.district or "(city-wide)" for d in docs]),
        "districts_missing": sorted(set(city.districts) - wikivoyage_districts),
        "images": {
            "with_image": sum(1 for d in docs if d.image_url),
            "see_documents": len(see),
            "see_with_image": see_with_image,
            "see_image_coverage": round(see_with_image / len(see), 3) if see else None,
        },
        # City-wide prose and listings without coordinates cannot have a district.
        "sleep_without_district": sorted(
            d.doc_id for d in docs if d.category == Category.SLEEP and not d.district
        ),
        "sleep_listings_with_coordinates_without_district": sum(
            1
            for d in docs
            if d.category == Category.SLEEP
            and d.kind == Kind.LISTING
            and d.lat is not None
            and not d.district
        ),
        "enrichment": result.enrichment,
        "coordinates_dropped_outside_bbox": result.coordinates_outside_bbox,
        "listings_skipped": result.listings_skipped,
        "revisions": dict(sorted(result.revisions.items())),
    }


def write(out_dir: Path, city: CityConfig, result: BuildResult) -> dict[str, Any]:
    problems = validate(result.documents, city)
    if problems:
        raise CorpusValidationError(problems)
    out_dir.mkdir(parents=True, exist_ok=True)
    lines = "".join(to_json_line(d) + "\n" for d in result.documents)
    (out_dir / "documents.jsonl").write_text(lines, encoding="utf-8")
    info = manifest(city, result)
    (out_dir / "manifest.json").write_text(
        json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return info
