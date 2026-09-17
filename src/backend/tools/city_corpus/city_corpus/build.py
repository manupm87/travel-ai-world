"""Build a city's corpus: fetch, parse, validate, write JSONL + manifest."""

import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import wikipedia, wikivoyage

logger = logging.getLogger(__name__)

MIN_TEXT_CHARS = 40
ALL_SOURCES = (Source.WIKIVOYAGE, Source.WIKIPEDIA)
# Always present in each JSONL line (null when unknown): the ADR 0012 payload schema.
# Listing extras are written only when they have a value.
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


def collect(
    city: CityConfig, client: ApiClient, sources: tuple[Source, ...] = ALL_SOURCES
) -> BuildResult:
    result = BuildResult(documents=[])
    if Source.WIKIVOYAGE in sources:
        stats = wikivoyage.ParseStats()
        for site in city.wikivoyage:
            for title in wikivoyage.list_titles(client, site):
                page, fetched_at = wikivoyage.fetch_page(client, site.lang, title)
                logger.info(
                    "wikivoyage:%s:%s rev %d", page.lang, page.title, page.revision_id
                )
                result.revisions[f"wikivoyage:{page.lang}:{page.title}"] = (
                    page.revision_id
                )
                result.fetched_at.append(fetched_at)
                result.documents += wikivoyage.parse_page(page, city, stats)
        result.coordinates_outside_bbox += stats.coordinates_outside_bbox
        result.listings_skipped += stats.listings_skipped

    if Source.WIKIPEDIA in sources:
        lang = city.wikipedia_lang
        page_ids: set[int] = set()
        for category in city.wikipedia_categories:
            members = wikipedia.category_members(client, lang, category)
            if not members:
                logger.warning("Category:%s has no articles", category)
            page_ids.update(members)
        for page_id in sorted(page_ids):
            article, fetched_at = wikipedia.fetch_article(client, lang, page_id)
            logger.info(
                "wikipedia:%s:%s rev %d", lang, article.title, article.revision_id
            )
            result.revisions[f"wikipedia:{lang}:{article.title}"] = article.revision_id
            result.fetched_at.append(fetched_at)
            result.documents += wikipedia.parse_article(article, city)
    return result


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
