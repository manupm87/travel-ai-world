"""Curated tours: `curated/<city>/tours.toml` → one `tour` document per tour.

No open source lists free walking tours, so the file is maintained by hand from each
operator's own website. Summaries are written in our own words; every entry records
the date its facts were checked.
"""

import datetime as dt
import logging
import re
import tomllib
from pathlib import Path
from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

from city_corpus.config.cities import CityConfig
from city_corpus.models import CC_BY_SA, Category, CorpusDocument, Kind, Source
from city_corpus.normalize import HEADING_SEPARATOR
from city_corpus.sources.districts import DistrictLocator

logger = logging.getLogger(__name__)

STALE_AFTER_DAYS = 180
TOUR_TYPES = ("walking", "bike", "boat", "bus", "cave", "food", "other")
# Headings under which Wikivoyage lists things you join rather than places you visit.
TOUR_HEADINGS = {
    "tours",
    "guided tours",
    "cave tours",
    "boating",
    "cruises",
    "sightseeing",
}
_TOUR_NAME_RE = re.compile(
    r"\b(tours?|cruises?|cruising|boat trips?|sightseeing|hop[- ]on|hop[- ]off)\b",
    re.IGNORECASE,
)
_TYPE_HINTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bcaves?\b", re.I), "cave"),
    (re.compile(r"\b(boat|boating|cruis\w*|river|danube)\b", re.I), "boat"),
    (re.compile(r"\b(bike|bicycle|cycling)\b", re.I), "bike"),
    (re.compile(r"\b(bus|hop[- ]on|hop[- ]off)\b", re.I), "bus"),
    (re.compile(r"\b(food|tasting|culinary)\b", re.I), "food"),
    (re.compile(r"\bwalk(ing)?\b", re.I), "walking"),
)
PRICE_LABELS = {"tip-based": "free, tip-based (pay what you want)"}
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_TIME_RE_ANY = re.compile(r"\d{1,2}:\d{2}")

NonEmpty = Annotated[str, Field(min_length=1)]


def _known_tour_type(value: str) -> str:
    if value not in TOUR_TYPES:
        raise ValueError(f"must be one of {TOUR_TYPES}")
    return value


TourType = Annotated[str, AfterValidator(_known_tour_type)]


class TourDataError(ValueError):
    """The curated file is malformed; the message lists every problem."""


class Tour(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: NonEmpty
    name: NonEmpty
    operator: NonEmpty
    operator_url: NonEmpty
    url: NonEmpty
    summary: Annotated[str, Field(min_length=40)]
    meeting_point: NonEmpty
    address: str | None = None
    lat: float
    lon: float
    start_times: Annotated[list[str], Field(min_length=1)]
    days: NonEmpty
    duration_minutes: Annotated[int, Field(gt=0, le=720)]
    languages: Annotated[list[str], Field(min_length=1)]
    tour_type: TourType = "walking"
    price_model: NonEmpty = "tip-based"
    booking_required: bool | None = None
    checked: dt.date
    notes: str | None = None  # for maintainers; never published

    @field_validator("id")
    @classmethod
    def _slug(cls, value: str) -> str:
        if not _ID_RE.match(value):
            raise ValueError("must be a lowercase slug (a-z, 0-9, hyphens)")
        return value

    @field_validator("url", "operator_url")
    @classmethod
    def _http(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("must be an http(s) URL")
        return value

    @field_validator("start_times")
    @classmethod
    def _times(cls, values: list[str]) -> list[str]:
        bad = [v for v in values if not _TIME_RE.match(v)]
        if bad:
            raise ValueError(f"times must be HH:MM (24 h): {bad}")
        return sorted(set(values))


class Include(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    doc_id: NonEmpty
    tour_type: TourType


class Reclassify(BaseModel):
    """Corrections to the automatic rule for documents from other sources."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    include: list[Include] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)


class CuratedTours(BaseModel):
    tours: list[Tour]
    reclassify: Reclassify


def load(path: Path, city: CityConfig) -> CuratedTours:
    """Parse and validate the file; raise `TourDataError` listing every problem."""
    if not path.exists():
        return CuratedTours(tours=[], reclassify=Reclassify())
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    problems: list[str] = []
    try:
        reclassify = Reclassify.model_validate(raw.get("reclassify", {}))
    except ValidationError as exc:
        problems += [
            f"reclassify.{'.'.join(map(str, e['loc']))}: {e['msg']}"
            for e in exc.errors()
        ]
        reclassify = Reclassify()
    tours: list[Tour] = []
    for index, entry in enumerate(raw.get("tour", []), start=1):
        label = entry.get("id", f"#{index}")
        try:
            tour = Tour.model_validate(entry)
        except ValidationError as exc:
            problems += [
                f"{label}.{'.'.join(map(str, e['loc']))}: {e['msg']}"
                for e in exc.errors()
            ]
            continue
        if not city.bbox.contains(tour.lat, tour.lon):
            problems.append(
                f"{label}: meeting point ({tour.lat}, {tour.lon}) outside the city"
            )
        tours.append(tour)
    ids = [t.id for t in tours]
    problems += [
        f"{i}: duplicate id" for i in sorted({i for i in ids if ids.count(i) > 1})
    ]
    if problems:
        raise TourDataError(f"{path}:\n  " + "\n  ".join(problems))
    return CuratedTours(tours=sorted(tours, key=lambda t: t.id), reclassify=reclassify)


def tour_type(*texts: str) -> str:
    for pattern, kind in _TYPE_HINTS:
        if any(pattern.search(t) for t in texts):
            return kind
    return "other"


def looks_like_tour(doc: CorpusDocument) -> bool:
    """Automatic rule: listed under a tour heading, or named like a tour/cruise."""
    if doc.kind != Kind.LISTING or doc.category == Category.TOUR:
        return False
    headings = doc.heading_path.split(HEADING_SEPARATOR)
    return any(h.lower() in TOUR_HEADINGS for h in headings) or bool(
        _TOUR_NAME_RE.search(doc.name or "")
    )


def reclassify(documents: list[CorpusDocument], rules: Reclassify) -> dict[str, int]:
    """Move tour-like documents from other sources to `tour`, in place."""
    included = {i.doc_id: i.tour_type for i in rules.include}
    excluded = set(rules.exclude)
    known = {d.doc_id for d in documents}
    missing = sorted((included.keys() | excluded) - known)
    if missing:
        logger.warning("reclassify entries not in the corpus: %s", ", ".join(missing))
    moved = 0
    for index, doc in enumerate(documents):
        if doc.doc_id in excluded:
            continue
        if doc.doc_id in included:
            kind = included[doc.doc_id]
        elif looks_like_tour(doc):
            kind = tour_type(doc.heading_path, doc.name or "")
        else:
            continue
        documents[index] = doc.model_copy(
            update={"category": Category.TOUR, "tour_type": kind}
        )
        moved += 1
    return {"reclassified_as_tour": moved, "reclassify_entries_missing": len(missing)}


def warn_stale(tours: list[Tour], today: dt.date) -> list[str]:
    """Ids whose facts were checked more than STALE_AFTER_DAYS ago (logged, not fatal)."""
    stale = [t.id for t in tours if (today - t.checked).days > STALE_AFTER_DAYS]
    if stale:
        logger.warning(
            "tours not checked for %d+ days: %s", STALE_AFTER_DAYS, ", ".join(stale)
        )
    return stale


def _duration(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    if not hours:
        return f"{rest} min"
    return f"{hours} h {rest} min" if rest else f"{hours} h"


def documents(
    tours: list[Tour], city: CityConfig, locator: DistrictLocator | None
) -> list[CorpusDocument]:
    docs: list[CorpusDocument] = []
    for tour in tours:
        district = locator.locate(tour.lat, tour.lon) if locator else None
        heading = [city.name, *([district] if district else []), "Tours"]
        where = (
            f"{tour.meeting_point}, {tour.address}"
            if tour.address
            else tour.meeting_point
        )
        # `days` sometimes spells the times out ("daily at 10:30, Sat also 15:30").
        times = ", ".join(tour.start_times)
        schedule = (
            tour.days if _TIME_RE_ANY.search(tour.days) else f"{tour.days} at {times}"
        )
        price = PRICE_LABELS.get(tour.price_model, tour.price_model)
        label = (
            "walking tour" if tour.tour_type == "walking" else f"{tour.tour_type} tour"
        )
        lines = [
            f"{tour.name} — {label} by {tour.operator} in {city.name}, {price}.",
            tour.summary.strip(),
            f"Meeting point: {where}. Starts: {schedule}. "
            f"Duration: about {_duration(tour.duration_minutes)}. "
            f"Languages: {', '.join(tour.languages)}.",
        ]
        if tour.booking_required:
            lines.append("Free registration on the operator's website is required.")
        docs.append(
            CorpusDocument(
                doc_id=f"tour:{city.slug}:{tour.id}",
                city=city.slug,
                district=district,
                category=Category.TOUR,
                kind=Kind.LISTING,
                name=tour.name,
                text="\n".join(lines),
                heading_path=HEADING_SEPARATOR.join(heading),
                lat=tour.lat,
                lon=tour.lon,
                hours=schedule,
                price=price,
                url=tour.url,
                source=Source.CURATED,
                source_url=tour.url,
                license=CC_BY_SA,
                lang="en",
                address=tour.address,
                tour_type=tour.tour_type,
                operator=tour.operator,
                start_times=tour.start_times,
                days=tour.days,
                duration_minutes=tour.duration_minutes,
                languages=tour.languages,
                price_model=tour.price_model,
                booking_required=tour.booking_required,
                checked=tour.checked.isoformat(),
            )
        )
    return docs
