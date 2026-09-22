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
from city_corpus.models import Category, CorpusDocument, Kind, Source

SIGHT_CATEGORIES = (Category.SEE, Category.HISTORY, Category.DO)
TOUR_NAMES_SHOWN = 12
PICTURED_CATEGORIES = (Category.SEE, Category.HISTORY)
TIERED_CATEGORIES = (Category.EAT, Category.SLEEP)
PRICE_TIERS = (1, 2, 3)
MONTHS = tuple(f"{month:02d}" for month in range(1, 13))
SMALL_DISTRICT_PLACES = 10
SMOKE_TOP = 3
# Where a hotel's photo came from, in the order the build tries them
# (ADR 0022, TRA-211). The same tuple as `sources.photos.SOURCES`, written out
# here because the report is read by people and the order is the story it tells.
PHOTO_SOURCES = ("curated", "site", "facebook", "commons", "wikidata", "page")
NOTABLE_SHOWN = 40
"""How many notable hotels without a photo the report names; a city has a few
dozen at most, and a list nobody finishes is a list nobody reads."""

# What a traveller asks for first, per category, in any city: nothing here
# names one city's specialities. A corpus that cannot name three places for
# each of these will not fill an itinerary either.
SMOKE_QUERIES: dict[Category, tuple[str, ...]] = {
    Category.SEE: ("museum", "cathedral", "viewpoint"),
    Category.DO: ("market",),
    Category.EAT: ("traditional restaurant", "street food"),
    Category.DRINK: ("craft beer bar", "cocktail bar"),
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
    # districts with a `neighbourhood` document (what the carousel ranks)
    described_districts: list[str]
    # category → "1" | "2" | "3" | "untiered" → documents
    price_tiers: dict[str, dict[str, int]]
    climate_months: list[str]
    climate_missing: list[str]
    # `tour` documents: from `curated/<slug>/tours.toml` (source `curated`), moved
    # there by the reclassification rule (any other source), and by `tour_type`.
    curated_tours: int
    reclassified_tours: int
    tours_by_type: dict[str, int]
    tour_names: list[str]
    # category → query → hits
    smoke: dict[str, dict[str, list[SmokeHit]]] = field(default_factory=dict)
    # What the build's photo stage did for the hotels (`manifest.json`
    # `enrichment.photos`, ADR 0022); empty when the manifest has none.
    hotel_photos: dict[str, Any] = field(default_factory=dict)

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
    def pictured_sleep(self) -> int:
        return self.pictured_by_category.get(Category.SLEEP.value, 0)

    @property
    def tour_documents(self) -> int:
        return self.curated_tours + self.reclassified_tours

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


def _manifest_of(data_dir: Path) -> dict[str, Any]:
    """`manifest.json` beside the corpus, or an empty mapping."""
    manifest = data_dir / "manifest.json"
    if not manifest.is_file():
        return {}
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def built_at_of(data_dir: Path) -> str | None:
    """The build time recorded by `manifest.json`, when the corpus has one."""
    value = _manifest_of(data_dir).get("built_at")
    return value if isinstance(value, str) else None


def hotel_photos_of(data_dir: Path) -> dict[str, Any]:
    """`enrichment.photos`: where each hotel's picture came from, and how many
    hotels the build dropped for having none. A corpus built before the photo
    stage has no such entry, and the report then counts only the total."""
    enrichment = _manifest_of(data_dir).get("enrichment")
    photos = enrichment.get("photos") if isinstance(enrichment, dict) else None
    return photos if isinstance(photos, dict) else {}


def summarise(
    documents: list[CorpusDocument],
    city: str,
    *,
    built_at: str | None = None,
    hotel_photos: dict[str, Any] | None = None,
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
    described = sorted(
        {
            d.district
            for d in documents
            if d.category == Category.NEIGHBOURHOOD and d.district
        }
    )
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

    tours = [d for d in documents if d.category == Category.TOUR]
    curated = sum(1 for d in tours if d.source == Source.CURATED)
    tours_by_type: Counter[str] = Counter(d.tour_type or "unknown" for d in tours)

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
        described_districts=described,
        price_tiers=price_tiers,
        climate_months=months_present,
        climate_missing=[m for m in MONTHS if m not in months_present],
        curated_tours=curated,
        reclassified_tours=len(tours) - curated,
        tours_by_type=dict(sorted(tours_by_type.items())),
        tour_names=sorted({d.name for d in tours if d.name})[:TOUR_NAMES_SHOWN],
        smoke=smoke(documents),
        hotel_photos=dict(hotel_photos or {}),
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
            "Pictured located sleep places",
            f"≥ {thresholds.pictured_sleep}",
            str(summary.pictured_sleep),
            summary.pictured_sleep >= thresholds.pictured_sleep,
        ),
        Check(
            "Districts",
            f"≥ {thresholds.districts}",
            str(len(summary.districts)),
            len(summary.districts) >= thresholds.districts,
        ),
        Check(
            "Districts with a neighbourhood document",
            f"≥ {thresholds.described_districts}",
            str(len(summary.described_districts)),
            len(summary.described_districts) >= thresholds.described_districts,
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
        Check(
            "Curated tours",
            f"≥ {thresholds.curated_tours}",
            str(summary.curated_tours),
            summary.curated_tours >= thresholds.curated_tours,
        ),
        Check(
            "Tour documents",
            f"≥ {thresholds.tour_documents}",
            str(summary.tour_documents),
            summary.tour_documents >= thresholds.tour_documents,
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


def hotel_photo_lines(summary: Summary) -> list[str]:
    """Where the hotels' photos came from, and which hotels lost their place.

    A corpus built before the photo stage (or reported without its manifest)
    knows only how many of its stays are pictured; a corpus built with it
    accounts for every one of them.
    """
    intro = (
        "Every located `sleep` place carries a photo: the corpus's own, a curated "
        "entry (`curated/<city>/hotels.toml`), the preview the hotel's site "
        "publishes, its Facebook page, a Wikimedia Commons file named after it, "
        "its Wikidata item found by name, or the largest picture on its homepage "
        "(ADR 0022). A hotel that ends the build without one is dropped."
    )
    photos = summary.hotel_photos
    if not photos:
        return [
            intro,
            "",
            f"{summary.pictured_sleep} of {summary.located_sleep} located sleep "
            "places are pictured.",
        ]
    found = {name: _count(photos.get(name)) for name in PHOTO_SOURCES}
    corpus = max(summary.pictured_sleep - sum(found.values()), 0)
    lines = [intro, ""]
    lines += _table(
        ["Source", "Hotels"],
        [["corpus", str(corpus)], *[[k, str(v)] for k, v in found.items()]],
    )
    dropped = _count(photos.get("dropped"))
    examples = [str(name) for name in photos.get("dropped_examples") or []]
    shown = (": " + ", ".join(examples) + "…") if examples else "."
    lines += ["", f"{dropped} hotels dropped for lack of a photo{shown}"]
    shared = _count(photos.get("shared"))
    lines += [
        "",
        f"{shared} shared chain pictures rejected: a picture two different hotels "
        "of the city both claim is neither one's, and those hotels are among the "
        "dropped. Two documents of the same hotel may share theirs.",
    ]
    return lines + notable_lines(summary)


def notable_lines(summary: Summary) -> list[str]:
    """The chain hotels the build could not picture, and why (TRA-211).

    Not a failure — the gate says nothing about it — but a worklist: each of
    these is a hotel a traveller would recognise, and each line says where the
    picture has to come from instead. `403` is a booking platform that refuses
    anything but a browser, `no url` a hotel OpenStreetMap has no website for,
    `dead` a domain that no longer answers, `no picture` a page holding none,
    `shared picture` a hotel whose only candidate was another hotel's too. All
    of them are answered the same way: open the page and curate the photo.
    """
    notable = [
        entry
        for entry in summary.hotel_photos.get("notable_without_photo") or []
        if isinstance(entry, dict) and entry.get("name")
    ]
    if not notable:
        return [
            "",
            "### Notable hotels without a photo",
            "",
            "None: every chain hotel of the city is pictured.",
        ]
    lines = [
        "",
        "### Notable hotels without a photo",
        "",
        f"{len(notable)} hotels of a chain left the corpus for want of a picture. "
        "Curate them in `curated/"
        f"{summary.city}/hotels.toml` — the runbook `docs/runbooks/add-city.md` "
        "says how, and never from a reseller.",
        "",
    ]
    lines += _table(
        ["Hotel", "Reason"],
        [
            [str(entry["name"]), str(entry.get("reason") or "unknown")]
            for entry in notable[:NOTABLE_SHOWN]
        ],
    )
    if len(notable) > NOTABLE_SHOWN:
        lines += [
            "",
            f"… and {len(notable) - NOTABLE_SHOWN} more in `manifest.json` "
            "(`enrichment.photos.notable_without_photo`).",
        ]
    return lines


def _count(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


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

    out += ["", "## Hotels", "", *hotel_photo_lines(summary)]

    out += ["", "## Districts", "", f"{len(summary.districts)} districts.", ""]
    out += _table(
        ["District", "Located places"],
        [[name, str(n)] for name, n in summary.places_by_district.items()],
    )
    small = ", ".join(summary.small_districts) or "none"
    out += ["", f"Districts with fewer than {SMALL_DISTRICT_PLACES} places: {small}."]
    undescribed = ", ".join(
        d for d in summary.districts if d not in summary.described_districts
    )
    out += [
        "",
        f"Districts with a neighbourhood document: {len(summary.described_districts)}"
        f" of {len(summary.districts)}"
        + (f" (without: {undescribed})." if undescribed else "."),
    ]

    out += ["", "## Price tiers", ""]
    out += _table(
        ["Category", "Tier 1", "Tier 2", "Tier 3", "Untiered"],
        [
            [category, *[str(tiers[key]) for key in ("1", "2", "3", "untiered")]]
            for category, tiers in summary.price_tiers.items()
        ],
    )

    by_type = ", ".join(f"{k} {v}" for k, v in summary.tours_by_type.items()) or "none"
    out += [
        "",
        "## Tours",
        "",
        f"{summary.tour_documents} tour documents: {summary.curated_tours} curated "
        f"(`curated/{summary.city}/tours.toml`), {summary.reclassified_tours} "
        f"reclassified from other sources. By type: {by_type}.",
    ]
    if summary.tour_names:
        out += ["", *[f"- {name}" for name in summary.tour_names]]

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
    summary = summarise(
        documents,
        slug,
        built_at=built_at_of(folder),
        hotel_photos=hotel_photos_of(folder),
    )
    (folder / "report.md").write_text(
        render_markdown(summary, thresholds), encoding="utf-8"
    )
    (folder / "report.json").write_text(as_json(summary, thresholds), encoding="utf-8")
    return summary, gate(summary, thresholds)
