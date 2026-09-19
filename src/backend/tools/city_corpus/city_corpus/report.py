"""Readiness report over a built corpus (TRA-166).

    python -m city_corpus report <slug> [--no-gate]

Reads `data/<slug>/documents.jsonl` and writes `report.md` (for people, committed
next to the corpus) and `report.json` (for tooling). Counts what the planner
needs — located listings, pictured sights, districts, price tiers, climate
normals — runs a few fixed smoke queries through a keyword scorer so a reader
can tell at a glance whether the corpus answers, and measures the numbers
against `config.readiness.Thresholds`.

Pure functions over the parsed documents; no network, no wall-clock. The same
file always renders the same report.
"""

import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from city_corpus.config.readiness import DEFAULT_THRESHOLDS, Thresholds
from city_corpus.models import Category, CorpusDocument, Kind

SIGHT_CATEGORIES = (Category.SEE, Category.HISTORY, Category.DO)
PICTURED_CATEGORIES = (Category.SEE, Category.HISTORY)
TIERED_CATEGORIES = (Category.EAT, Category.SLEEP)
PRICE_TIERS = (1, 2, 3)
MONTHS = tuple(f"{month:02d}" for month in range(1, 13))
SMALL_DISTRICT_PLACES = 10
SMOKE_TOP = 3

# What a traveller asks for first, per category. A corpus that cannot name three
# places for each of these will not fill an itinerary either.
SMOKE_QUERIES: dict[Category, tuple[str, ...]] = {
    Category.SEE: ("thermal baths", "museum", "viewpoint"),
    Category.DO: ("market",),
    Category.EAT: ("traditional restaurant", "street food"),
    Category.DRINK: ("ruin bar", "cocktail bar"),
    Category.SLEEP: ("boutique hotel", "hostel"),
    Category.TOUR: ("free walking tour",),
}

_TOKEN = re.compile(r"[^\W_]+", re.UNICODE)


class ReportError(ValueError):
    """The corpus file is missing or a line is not a corpus document."""


@dataclass(frozen=True)
class SmokeHit:
    name: str
    district: str | None
    score: float


@dataclass(frozen=True)
class Check:
    name: str
    threshold: str
    measured: str
    passed: bool


@dataclass
class Summary:
    city: str
    built_at: str | None
    documents: int
    listings: int
    prose: int
    sources: list[str]
    categories: list[str]
    # category → source → documents
    by_category_source: dict[str, dict[str, int]]
    # category → named documents / located (name + coordinates: what becomes a
    # planner card) / pictured (located with an `image_url`)
    named_by_category: dict[str, int]
    located_by_category: dict[str, int]
    pictured_by_category: dict[str, int]
    districts: list[str]
    # district → located places
    places_by_district: dict[str, int]
    small_districts: list[str]
    # category → "1" | "2" | "3" | "untiered" → documents
    price_tiers: dict[str, dict[str, int]]
    climate_months: list[str]
    climate_missing: list[str]
    # category → query → hits
    smoke: dict[str, dict[str, list[SmokeHit]]] = field(default_factory=dict)

    @property
    def located_sights(self) -> int:
        return sum(self.located_by_category.get(c.value, 0) for c in SIGHT_CATEGORIES)

    @property
    def located_eat(self) -> int:
        return self.located_by_category.get(Category.EAT.value, 0)

    @property
    def sleep(self) -> int:
        return sum(self.by_category_source.get(Category.SLEEP.value, {}).values())

    @property
    def located_sleep(self) -> int:
        return self.located_by_category.get(Category.SLEEP.value, 0)

    @property
    def pictured_sights_share(self) -> float:
        located = sum(
            self.located_by_category.get(c.value, 0) for c in PICTURED_CATEGORIES
        )
        pictured = sum(
            self.pictured_by_category.get(c.value, 0) for c in PICTURED_CATEGORIES
        )
        return pictured / located if located else 0.0


def load_documents(path: Path) -> list[CorpusDocument]:
    """Every line of a `documents.jsonl`; a malformed line names itself."""
    if not path.is_file():
        raise ReportError(f"no corpus at {path}")
    documents: list[CorpusDocument] = []
    with path.open(encoding="utf-8") as lines:
        for number, line in enumerate(lines, start=1):
            if not line.strip():
                continue
            try:
                documents.append(CorpusDocument.model_validate_json(line))
            except ValidationError as exc:
                raise ReportError(f"{path}:{number} is not a corpus document") from exc
    return documents


def built_at_of(data_dir: Path) -> str | None:
    """The build time recorded by `manifest.json`, when the corpus has one."""
    manifest = data_dir / "manifest.json"
    if not manifest.is_file():
        return None
    try:
        value = json.loads(manifest.read_text(encoding="utf-8")).get("built_at")
    except (ValueError, AttributeError):
        return None
    return value if isinstance(value, str) else None


def summarise(
    documents: list[CorpusDocument], city: str, *, built_at: str | None = None
) -> Summary:
    listings = [d for d in documents if d.kind == Kind.LISTING]
    by_category_source: dict[str, Counter[str]] = defaultdict(Counter)
    for doc in documents:
        by_category_source[doc.category.value][doc.source.value] += 1

    named_by_category: Counter[str] = Counter()
    located_by_category: Counter[str] = Counter()
    pictured_by_category: Counter[str] = Counter()
    places_by_district: Counter[str] = Counter()
    for doc in documents:
        if not doc.name:
            continue
        named_by_category[doc.category.value] += 1
        if not is_located(doc):
            continue
        located_by_category[doc.category.value] += 1
        if doc.image_url:
            pictured_by_category[doc.category.value] += 1
        if doc.district:
            places_by_district[doc.district] += 1

    districts = sorted({d.district for d in documents if d.district})
    small = [
        name
        for name in districts
        if places_by_district.get(name, 0) < SMALL_DISTRICT_PLACES
    ]

    price_tiers: dict[str, dict[str, int]] = {}
    for category in TIERED_CATEGORIES:
        tiers: Counter[str] = Counter()
        for doc in documents:
            if doc.category != category:
                continue
            key = str(doc.price_tier) if doc.price_tier in PRICE_TIERS else "untiered"
            tiers[key] += 1
        price_tiers[category.value] = {
            key: tiers.get(key, 0) for key in (*map(str, PRICE_TIERS), "untiered")
        }

    prefix = f"om:climate:{city}:"
    months_present = sorted(
        {
            doc.doc_id.removeprefix(prefix)
            for doc in documents
            if doc.category == Category.CLIMATE
            and doc.doc_id.startswith(prefix)
            and doc.doc_id.removeprefix(prefix) in MONTHS
        }
    )

    return Summary(
        city=city,
        built_at=built_at,
        documents=len(documents),
        listings=len(listings),
        prose=len(documents) - len(listings),
        sources=sorted({d.source.value for d in documents}),
        categories=sorted({d.category.value for d in documents}),
        by_category_source={
            category: dict(sorted(sources.items()))
            for category, sources in sorted(by_category_source.items())
        },
        named_by_category=dict(sorted(named_by_category.items())),
        located_by_category=dict(sorted(located_by_category.items())),
        pictured_by_category=dict(sorted(pictured_by_category.items())),
        districts=districts,
        places_by_district={d: places_by_district.get(d, 0) for d in districts},
        small_districts=small,
        price_tiers=price_tiers,
        climate_months=months_present,
        climate_missing=[m for m in MONTHS if m not in months_present],
        smoke=smoke(documents),
    )


def is_located(doc: CorpusDocument) -> bool:
    return doc.lat is not None and doc.lon is not None


def tokens(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN.findall(text)]


def score(query_terms: list[str], doc: CorpusDocument) -> float:
    """Keyword match: every query term found weighs more than repetitions do.

    A term in the name counts as three occurrences, so "Rudas Baths" outranks a
    restaurant whose description mentions the baths next door.
    """
    name_counts = Counter(tokens(doc.name or ""))
    text_counts = Counter(tokens(doc.text))
    matched = 0
    weight = 0.0
    for term in query_terms:
        occurrences = 3 * name_counts[term] + text_counts[term]
        if occurrences:
            matched += 1
            weight += math.log1p(occurrences)
    if not matched:
        return 0.0
    return matched * 10 + weight


def smoke(documents: list[CorpusDocument]) -> dict[str, dict[str, list[SmokeHit]]]:
    """Top named documents per fixed query, per category."""
    named_by_category: dict[Category, list[CorpusDocument]] = defaultdict(list)
    for doc in documents:
        if doc.name:
            named_by_category[doc.category].append(doc)

    results: dict[str, dict[str, list[SmokeHit]]] = {}
    for category, queries in SMOKE_QUERIES.items():
        per_query: dict[str, list[SmokeHit]] = {}
        for query in queries:
            terms = tokens(query)
            scored = [
                (score(terms, doc), doc) for doc in named_by_category.get(category, [])
            ]
            # Highest score first; ties by name, then id, so the order is stable.
            ranked = sorted(
                ((s, d) for s, d in scored if s > 0),
                key=lambda pair: (-pair[0], pair[1].name or "", pair[1].doc_id),
            )
            seen: set[str] = set()
            hits: list[SmokeHit] = []
            for value, doc in ranked:
                if doc.name in seen:
                    continue  # the same place from two sources
                seen.add(doc.name or "")
                hits.append(SmokeHit(doc.name or "", doc.district, round(value, 2)))
                if len(hits) == SMOKE_TOP:
                    break
            per_query[query] = hits
        results[category.value] = per_query
    return results


def checks(
    summary: Summary, thresholds: Thresholds = DEFAULT_THRESHOLDS
) -> list[Check]:
    """Every threshold with its measured value, pass or fail."""
    share = summary.pictured_sights_share
    return [
        Check(
            "Located see + history + do places",
            f"≥ {thresholds.located_sights}",
            str(summary.located_sights),
            summary.located_sights >= thresholds.located_sights,
        ),
        Check(
            "Located eat places",
            f"≥ {thresholds.located_eat}",
            str(summary.located_eat),
            summary.located_eat >= thresholds.located_eat,
        ),
        Check(
            "Sleep documents",
            f"≥ {thresholds.sleep}",
            str(summary.sleep),
            summary.sleep >= thresholds.sleep,
        ),
        Check(
            "Located sleep places",
            f"≥ {thresholds.located_sleep}",
            str(summary.located_sleep),
            summary.located_sleep >= thresholds.located_sleep,
        ),
        Check(
            "Districts",
            f"≥ {thresholds.districts}",
            str(len(summary.districts)),
            len(summary.districts) >= thresholds.districts,
        ),
        Check(
            "Pictured share of located see + history places",
            f"≥ {thresholds.pictured_sights_share:.0%}",
            f"{share:.0%}",
            share >= thresholds.pictured_sights_share,
        ),
        Check(
            "Climate normals",
            f"= {thresholds.climate_normals}",
            str(len(summary.climate_months)),
            len(summary.climate_months) == thresholds.climate_normals,
        ),
    ]


def gate(summary: Summary, thresholds: Thresholds = DEFAULT_THRESHOLDS) -> list[str]:
    """The failing lines; empty when the corpus is ready to index."""
    return [
        f"{check.name}: {check.measured} (needs {check.threshold})"
        for check in checks(summary, thresholds)
        if not check.passed
    ]


def as_json(summary: Summary, thresholds: Thresholds = DEFAULT_THRESHOLDS) -> str:
    data: dict[str, Any] = asdict(summary)
    data["readiness"] = {
        "passed": not gate(summary, thresholds),
        "checks": [asdict(check) for check in checks(summary, thresholds)],
        "thresholds": asdict(thresholds),
    }
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def _table(headers: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return lines


def render_markdown(
    summary: Summary, thresholds: Thresholds = DEFAULT_THRESHOLDS
) -> str:
    built = f"Built {summary.built_at} · " if summary.built_at else ""
    out = [
        f"# Readiness report — {summary.city}",
        "",
        f"{built}{summary.documents} documents "
        f"({summary.listings} listings, {summary.prose} prose). "
        "Generated by `just corpus-report`; do not edit.",
        "",
        "## Documents per category and source",
        "",
    ]
    sources = summary.sources
    rows = [
        [category, *[str(counts.get(s, 0)) for s in sources], str(sum(counts.values()))]
        for category, counts in summary.by_category_source.items()
    ]
    out += _table(["Category", *sources, "Total"], rows)

    out += [
        "",
        "## Places per category: named, located and pictured",
        "",
        "A place is a document with a name; located when it has coordinates (what "
        "becomes a planner card); pictured when a located place has an image.",
        "",
    ]
    rows = []
    for category, named in summary.named_by_category.items():
        located = summary.located_by_category.get(category, 0)
        pictured = summary.pictured_by_category.get(category, 0)
        rows.append(
            [
                category,
                str(named),
                str(located),
                str(pictured),
                f"{pictured / located:.0%}" if located else "-",
            ]
        )
    out += _table(["Category", "Named", "Located", "Pictured", "Pictured share"], rows)

    out += ["", "## Districts", "", f"{len(summary.districts)} districts.", ""]
    out += _table(
        ["District", "Located places"],
        [[name, str(n)] for name, n in summary.places_by_district.items()],
    )
    small = ", ".join(summary.small_districts) or "none"
    out += ["", f"Districts with fewer than {SMALL_DISTRICT_PLACES} places: {small}."]

    out += ["", "## Price tiers", ""]
    out += _table(
        ["Category", "Tier 1", "Tier 2", "Tier 3", "Untiered"],
        [
            [category, *[str(tiers[key]) for key in ("1", "2", "3", "untiered")]]
            for category, tiers in summary.price_tiers.items()
        ],
    )

    missing = ", ".join(summary.climate_missing) or "none"
    out += [
        "",
        "## Climate normals",
        "",
        f"{len(summary.climate_months)} of {len(MONTHS)} months present "
        f"(missing: {missing}).",
    ]

    out += ["", "## Smoke queries", ""]
    for category, per_query in summary.smoke.items():
        for query, hits in per_query.items():
            out.append(f'**{category} — "{query}"**')
            out.append("")
            if hits:
                for position, hit in enumerate(hits, start=1):
                    where = f" ({hit.district})" if hit.district else ""
                    out.append(f"{position}. {hit.name}{where}")
            else:
                out.append("_no match_")
            out.append("")

    out += ["## Readiness", ""]
    out += _table(
        ["Check", "Threshold", "Measured", "Result"],
        [
            [c.name, c.threshold, c.measured, "pass" if c.passed else "**FAIL**"]
            for c in checks(summary, thresholds)
        ],
    )
    verdict = "fails" if gate(summary, thresholds) else "passes"
    out += ["", f"The corpus {verdict} the readiness gate.", ""]
    return "\n".join(out)


def write_report(
    data_dir: Path, slug: str, thresholds: Thresholds = DEFAULT_THRESHOLDS
) -> tuple[Summary, list[str]]:
    """Report `data_dir/<slug>` into `report.md` and `report.json`; return the failures."""
    folder = data_dir / slug
    documents = load_documents(folder / "documents.jsonl")
    summary = summarise(documents, slug, built_at=built_at_of(folder))
    (folder / "report.md").write_text(
        render_markdown(summary, thresholds), encoding="utf-8"
    )
    (folder / "report.json").write_text(as_json(summary, thresholds), encoding="utf-8")
    return summary, gate(summary, thresholds)
