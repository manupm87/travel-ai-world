"""OpenStreetMap (Overpass): hotels, restaurants, bars, sights, parks and baths.

An element that is already in the corpus (same Wikidata id, or same normalised name
within 75 m) adds its tags to that document; any other element becomes a new document.
"""

import math
import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient, Fetched
from city_corpus.models import ODBL, Category, CorpusDocument, Kind, Source
from city_corpus.normalize import HEADING_SEPARATOR
from city_corpus.sources.districts import OVERPASS_URL, DistrictLocator, area_selector


@dataclass(frozen=True)
class Query:
    key: str
    category: Category
    selectors: tuple[str, ...]


# Order matters: an element returned by two queries keeps the first category.
QUERIES: tuple[Query, ...] = (
    Query(
        "sleep",
        Category.SLEEP,
        ('nwr["tourism"~"^(hotel|hostel|guest_house|apartment)$"]["name"]',),
    ),
    Query(
        "see",
        Category.SEE,
        (
            'nwr["tourism"~"^(attraction|museum|gallery|viewpoint)$"]["name"]',
            'nwr["historic"]["name"]',
        ),
    ),
    Query("eat", Category.EAT, ('nwr["amenity"~"^(restaurant|cafe)$"]["name"]',)),
    Query("drink", Category.DRINK, ('nwr["amenity"~"^(bar|pub)$"]["name"]',)),
    Query("parks", Category.DO, ('nwr["leisure"="park"]["name"]',)),
    Query(
        "baths",
        Category.DO,
        (
            'nwr["amenity"="public_bath"]["name"]',
            'nwr["leisure"="sports_centre"]["sport"="swimming"]["name"]',
        ),
    ),
)
USEFUL_TAGS = ("wikidata", "website", "opening_hours", "stars", "cuisine")
# A Facebook page is kept when an element is already a document (its `og:image` is
# the page's profile photo, a last resort for a hotel with no other picture), but it
# never makes a document on its own: a venue known by nothing else is not one.
FACEBOOK_TAGS = ("contact:facebook", "facebook")
# Gunter Demnig's stones come in three shapes (stone, threshold, head stone).
SMALL_MEMORIALS = frozenset({"stolperstein", "stolperschwelle", "kopfstein", "plaque"})
MATCH_DISTANCE_M = 75.0
MIN_CONTAINED_NAME = 6
MIN_TEXT_CHARS = 40
_THERMAL_RE = re.compile(r"fürdő|gyógy|therm|termál|spa\b", re.IGNORECASE)
_WIKIDATA_RE = re.compile(r"^Q\d+$")
_LABELS = {
    "hotel": "hotel",
    "hostel": "hostel",
    "guest_house": "guest house",
    "apartment": "holiday apartment",
    "restaurant": "restaurant",
    "cafe": "café",
    "bar": "bar",
    "pub": "pub",
    "attraction": "attraction",
    "museum": "museum",
    "gallery": "gallery",
    "viewpoint": "viewpoint",
    "park": "park",
    "public_bath": "bath",
    "sports_centre": "swimming pool",
}


@dataclass(frozen=True)
class OsmPlace:
    osm_id: str
    category: Category
    name: str
    lat: float
    lon: float
    tags: dict[str, str]

    @property
    def label(self) -> str:
        tags = self.tags
        for key in ("tourism", "amenity", "leisure"):
            if tags.get(key) in _LABELS:
                return _LABELS[tags[key]]
        historic = tags.get("historic")
        if historic and historic != "yes":
            return historic.replace("_", " ")
        return "historic site" if historic else self.category.value


@dataclass
class OsmStats:
    elements: int = 0
    candidates: int = 0
    merged: int = 0
    new: int = 0
    outside_bbox: int = 0
    too_short: int = 0
    timestamp: str | None = None
    fetched_at: list[str] = field(default_factory=list)


def fetch(client: ApiClient, city: CityConfig) -> list[tuple[Query, Fetched]]:
    results: list[tuple[Query, Fetched]] = []
    for query in QUERIES:
        body = "".join(f"{s}(area.a);" for s in query.selectors)
        text = f"[out:json][timeout:240];{area_selector(city)}({body});out tags center;"
        results.append((query, client.post_form(OVERPASS_URL, {"data": text})))
    return results


def fetch_wikidata_links(client: ApiClient, city: CityConfig) -> Fetched:
    """Every named element with a `wikidata` tag, used only to link existing documents."""
    text = (
        f"[out:json][timeout:240];{area_selector(city)}"
        '(nwr["wikidata"]["name"](area.a););out tags center;'
    )
    return client.post_form(OVERPASS_URL, {"data": text})


def link_wikidata(documents: list[CorpusDocument], data: dict[str, Any]) -> int:
    """Give a Wikidata id to documents without one when an OSM element with that id
    has the same name within 75 m (OSM names are Hungarian: the documents' `alt`
    names often are too). Returns the number of documents linked."""
    by_cell: dict[tuple[int, int], list[tuple[float, float, dict[str, str]]]] = {}
    for element in sorted(data.get("elements", []), key=lambda e: (e["type"], e["id"])):
        point = element if "lat" in element else element.get("center", {})
        tags = element.get("tags", {})
        if "lat" in point and "lon" in point and _wikidata(tags):
            cell = _cell(point["lat"], point["lon"])
            by_cell.setdefault(cell, []).append((point["lat"], point["lon"], tags))

    linked = 0
    for index, doc in enumerate(documents):
        if doc.wikidata or not _matchable(doc):
            continue
        qid = _nearby_wikidata(doc, by_cell)
        if qid:
            documents[index] = doc.model_copy(update={"wikidata": qid})
            linked += 1
    return linked


def _nearby_wikidata(
    doc: CorpusDocument,
    by_cell: dict[tuple[int, int], list[tuple[float, float, dict[str, str]]]],
) -> str | None:
    if doc.lat is None or doc.lon is None or not doc.name:
        return None
    row, col = _cell(doc.lat, doc.lon)
    candidates = (doc.name, doc.alt or "")
    for dr, dc in ((dr, dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1)):
        for lat, lon, tags in by_cell.get((row + dr, col + dc), []):
            if distance_m(lat, lon, doc.lat, doc.lon) >= MATCH_DISTANCE_M:
                continue
            names = [tags.get(k, "") for k in ("name", "name:en", "alt_name")]
            if any(names_match(n, c) for n in names if n for c in candidates):
                return _wikidata(tags)
    return None


def _is_useful(query: Query, tags: dict[str, str]) -> bool:
    if not tags.get("name") or not any(tags.get(t) for t in USEFUL_TAGS):
        return False
    # Small galleries without a Wikidata item have no photo for a card and are rarely
    # sights; notable ones have an item (decided on TRA-139).
    if tags.get("tourism") == "gallery" and not _wikidata(tags):
        return False
    # A stumbling stone or a wall plaque marks a person or an event, not a place to
    # spend a morning: Berlin tags 7,362 Stolpersteine `historic=memorial`, most
    # with a website, which would have outnumbered its sights three to one. The
    # notable memorials come from Wikipedia's `Monuments and memorials in X`.
    if tags.get("memorial") in SMALL_MEMORIALS:
        return False
    if query.key == "baths" and tags.get("leisure") == "sports_centre":
        return tags.get("bath:type") == "thermal" or bool(
            _THERMAL_RE.search(tags["name"])
        )
    return True


def places(
    responses: Iterable[tuple[Query, dict[str, Any]]],
    city: CityConfig,
    stats: OsmStats,
) -> list[OsmPlace]:
    seen: set[str] = set()
    found: list[OsmPlace] = []
    for query, data in responses:
        timestamp = data.get("osm3s", {}).get("timestamp_osm_base")
        if timestamp and (stats.timestamp is None or timestamp > stats.timestamp):
            stats.timestamp = timestamp
        elements = sorted(data.get("elements", []), key=lambda e: (e["type"], e["id"]))
        stats.elements += len(elements)
        for element in elements:
            osm_id = f"{element['type']}/{element['id']}"
            tags = element.get("tags", {})
            if osm_id in seen or not _is_useful(query, tags):
                continue
            seen.add(osm_id)
            point = element if "lat" in element else element.get("center", {})
            if "lat" not in point or "lon" not in point:
                continue
            lat, lon = round(float(point["lat"]), 6), round(float(point["lon"]), 6)
            if not city.bbox.contains(lat, lon):
                stats.outside_bbox += 1
                continue
            found.append(
                OsmPlace(
                    osm_id=osm_id,
                    category=query.category,
                    name=tags["name"].strip(),
                    lat=lat,
                    lon=lon,
                    tags=tags,
                )
            )
    stats.candidates = len(found)
    return found


def normalise_name(name: str) -> str:
    ascii_name = (
        unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    )
    return " ".join(re.findall(r"[a-z0-9]+", ascii_name.lower()))


def names_match(a: str, b: str) -> bool:
    x, y = normalise_name(a), normalise_name(b)
    if not x or not y:
        return False
    if x == y:
        return True
    short, long = sorted((x, y), key=len)
    return len(short) >= MIN_CONTAINED_NAME and f" {short} " in f" {long} "


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _matchable(doc: CorpusDocument) -> bool:
    """Documents that describe one place: listings and Wikipedia article leads."""
    return doc.kind == Kind.LISTING or (
        doc.source == Source.WIKIPEDIA and doc.category == Category.SEE
    )


def _cell(lat: float, lon: float) -> tuple[int, int]:
    return (math.floor(lat / 0.001), math.floor(lon / 0.0015))  # ~110 m x ~115 m


def _clean(value: str | None) -> str | None:
    if not value:
        return None
    return value.replace(";", ", ").replace("_", " ").strip() or None


def _url(tags: dict[str, str]) -> str | None:
    for key in ("website", "contact:website", "url"):
        value = tags.get(key, "")
        if re.match(r"^https?://", value):
            return value
    return None


def _wikidata(tags: dict[str, str]) -> str | None:
    value = tags.get("wikidata", "")
    return value if _WIKIDATA_RE.match(value) else None


def _facebook(tags: dict[str, str]) -> str | None:
    """The element's Facebook page as an absolute URL, or None.

    OSM holds it three ways: a full URL, a bare `facebook.com/...` and the page
    name alone (`HotelGellert`). Anything with a space in it is a caption, not
    a page.
    """
    for key in FACEBOOK_TAGS:
        value = tags.get(key, "").strip()
        if not value or any(c.isspace() for c in value):
            continue
        if value.startswith("https://"):
            return value
        if value.startswith("http://"):
            return "https://" + value.removeprefix("http://")
        bare = value.lstrip("/")
        for host in (
            "www.facebook.com/",
            "facebook.com/",
            "m.facebook.com/",
            "fb.com/",
        ):
            if bare.lower().startswith(host):
                return "https://www.facebook.com/" + bare[len(host) :]
        if "/" not in bare.rstrip("/") and "." not in bare:
            return f"https://www.facebook.com/{bare}"
    return None


def _commons_file(tags: dict[str, str]) -> str | None:
    value = tags.get("wikimedia_commons", "")
    return value.removeprefix("File:") if value.startswith("File:") else None


def _osm_fields(place: OsmPlace) -> dict[str, str | None]:
    tags = place.tags
    return {
        "osm_id": place.osm_id,
        "opening_hours": tags.get("opening_hours") or None,
        "stars": tags.get("stars") or None,
        "cuisine": _clean(tags.get("cuisine")),
        "wheelchair": tags.get("wheelchair") or None,
        "facebook": _facebook(tags),
    }


def merge(
    documents: list[CorpusDocument],
    found: list[OsmPlace],
    city: CityConfig,
    locator: DistrictLocator | None,
    stats: OsmStats,
) -> list[CorpusDocument]:
    """Update matching documents in place (by index) and return the new ones."""
    by_wikidata: dict[str, list[int]] = {}
    by_cell: dict[tuple[int, int], list[int]] = {}
    for index, doc in enumerate(documents):
        if not _matchable(doc):
            continue
        if doc.wikidata:
            by_wikidata.setdefault(doc.wikidata, []).append(index)
        if doc.lat is not None and doc.lon is not None and doc.name:
            by_cell.setdefault(_cell(doc.lat, doc.lon), []).append(index)

    new_documents: list[CorpusDocument] = []
    for place in found:
        matches = _matches(documents, place, by_wikidata, by_cell)
        if matches:
            stats.merged += 1
            for index in matches:
                documents[index] = _enrich_existing(documents[index], place)
            continue
        district = locator.locate(place.lat, place.lon) if locator else None
        document = _new_document(place, city, district)
        if len(document.text) < MIN_TEXT_CHARS:  # a name and a label, nothing else
            stats.too_short += 1
            continue
        stats.new += 1
        new_documents.append(document)
    return new_documents


def _matches(
    documents: list[CorpusDocument],
    place: OsmPlace,
    by_wikidata: dict[str, list[int]],
    by_cell: dict[tuple[int, int], list[int]],
) -> list[int]:
    wikidata = _wikidata(place.tags)
    if wikidata and wikidata in by_wikidata:
        return by_wikidata[wikidata]
    row, col = _cell(place.lat, place.lon)
    nearby = sorted(
        index
        for dr in (-1, 0, 1)
        for dc in (-1, 0, 1)
        for index in by_cell.get((row + dr, col + dc), [])
    )
    names = [place.name, *(place.tags.get(k, "") for k in ("name:en", "alt_name"))]
    for index in nearby:
        doc = documents[index]
        if doc.lat is None or doc.lon is None or not doc.name:
            continue
        if distance_m(place.lat, place.lon, doc.lat, doc.lon) >= MATCH_DISTANCE_M:
            continue
        candidates = (doc.name, doc.alt or "")
        if any(names_match(n, c) for n in names if n for c in candidates):
            return [index]
    return []


def _enrich_existing(doc: CorpusDocument, place: OsmPlace) -> CorpusDocument:
    update: dict[str, str | None] = {
        key: value
        for key, value in _osm_fields(place).items()
        if value is not None and getattr(doc, key) is None
    }
    wikidata = _wikidata(place.tags)
    if doc.wikidata is None and wikidata:
        update["wikidata"] = wikidata
    commons = _commons_file(place.tags)
    if doc.image is None and commons:
        update["image"] = commons
    return doc.model_copy(update=update) if update else doc


def _stars_tier(stars: str | None) -> int | None:
    match = re.match(r"^\d+", stars or "")
    if not match:
        return None
    value = int(match.group())
    return 1 if value <= 2 else 2 if value == 3 else 3


def _new_document(
    place: OsmPlace, city: CityConfig, district: str | None
) -> CorpusDocument:
    tags = place.tags
    fields = _osm_fields(place)
    name_en = tags.get("name:en")
    alt = name_en if name_en and name_en != place.name else None
    where = f"{district}, {city.name}" if district else city.name
    title = f"{place.name} ({alt})" if alt else place.name
    sentences = [f"{title} — {place.label} in {where}."]
    if tags.get("description"):
        sentences.append(tags["description"].strip().rstrip(".") + ".")
    street = " ".join(
        filter(None, (tags.get("addr:street"), tags.get("addr:housenumber")))
    )
    address = ", ".join(filter(None, (street, tags.get("addr:postcode")))) or None
    facts = (
        ("Cuisine", fields["cuisine"]),
        ("Stars", fields["stars"]),
        ("Opening hours", fields["opening_hours"]),
        ("Address", address),
    )
    sentences += [f"{label}: {value}." for label, value in facts if value]
    heading = [
        city.name,
        *([district] if district else []),
        place.category.value.title(),
    ]
    return CorpusDocument(
        doc_id=f"osm:{place.osm_id}",
        city=city.slug,
        district=district,
        category=place.category,
        kind=Kind.LISTING,
        name=place.name,
        text=" ".join(sentences),
        heading_path=HEADING_SEPARATOR.join(heading),
        lat=place.lat,
        lon=place.lon,
        hours=fields["opening_hours"],
        price_tier=_stars_tier(fields["stars"])
        if place.category == Category.SLEEP
        else None,
        url=_url(tags),
        wikidata=_wikidata(place.tags),
        source=Source.OPENSTREETMAP,
        source_url=f"https://www.openstreetmap.org/{place.osm_id}",
        license=ODBL,
        lang="en",
        alt=alt,
        address=address,
        phone=tags.get("phone") or tags.get("contact:phone") or None,
        image=_commons_file(tags),
        osm_id=fields["osm_id"],
        opening_hours=fields["opening_hours"],
        stars=fields["stars"],
        cuisine=fields["cuisine"],
        wheelchair=fields["wheelchair"],
        facebook=fields["facebook"],
    )
