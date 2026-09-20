"""Draft a city's `cities/<slug>.toml` from open sources.

    python -m city_corpus discover "Bologna"

Nobody writes a city configuration from scratch: this asks Wikidata for the city
item (coordinates, districts, OSM relation, Wikivoyage and Wikipedia titles),
Nominatim for the relation's bounds, Open-Meteo for the IANA time zone, Wikivoyage
for the district guides and Wikipedia for which standard categories exist, and
writes `cities/<slug>.draft.toml` with a `# review` mark on every line it could not
decide. Rename the reviewed draft to `cities/<slug>.toml` and build.

Everything goes through `ApiClient` (cache, User-Agent, maxlag, backoff) and
one Overpass query lists the district boundaries without their geometry.
"""

import logging
import math
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from city_corpus.config.cities import CITIES_DIR, HeroPhoto, WikivoyageSite
from city_corpus.http import ApiClient
from city_corpus.normalize import slugify
from city_corpus.sources import wikipedia, wikivoyage
from city_corpus.sources.districts import OVERPASS_URL
from city_corpus.sources.wikidata import (
    IMAGE,
    WIKIDATA_API,
    commons_title,
    fetch_image_info,
    is_free,
)

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/lookup"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
WIKIVOYAGE_LANGS = ("en", "es")
# Wikipedia categories worth probing for any city; the second value is
# `require_coordinates` (broad categories hold offices and embassies too).
STANDARD_CATEGORIES: tuple[tuple[str, bool], ...] = (
    ("Tourist attractions in {city}", False),
    ("Museums in {city}", False),
    ("Bridges in {city}", False),
    ("Parks in {city}", False),
    ("Parks and open spaces in {city}", False),
    ("Churches in {city}", False),
    ("Squares in {city}", False),
    ("Monuments and memorials in {city}", False),
    ("Buildings and structures in {city}", True),
    ("Roman Catholic churches in {city}", False),
    ("Piazzas in {city}", False),
    ("Palaces in {city}", False),
    ("Towers in {city}", False),
    ("Thermal baths in {city}", False),
    ("Synagogues in {city}", False),
    # Italian and Spanish cities file their sights under these (Bologna: 9
    # basilicas, 9 gates, 36 Renaissance and 13 Baroque buildings, no
    # `Churches in`). The architecture ones hold seminaries and offices too.
    ("Basilica churches in {city}", False),
    ("Gates of {city}", False),
    ("City gates of {city}", False),
    ("Theatres in {city}", False),
    ("Libraries in {city}", True),
    ("Villas in {city}", False),
    ("Cemeteries in {city}", False),
    ("Fountains in {city}", False),
    ("Renaissance architecture in {city}", True),
    ("Baroque architecture in {city}", True),
    ("Gothic architecture in {city}", True),
)
# Instance-of classes that make a search hit a city without a second look.
CITY_CLASSES = {
    "Q515",  # city
    "Q1549591",  # big city
    "Q1637706",  # city with millions of inhabitants
    "Q5119",  # capital city
    "Q200250",  # metropolis
    "Q3957",  # town
    "Q15284",  # municipality
    "Q747074",  # comune of Italy
    "Q484170",  # commune of France
    "Q2039348",  # municipality of Spain
    "Q262166",  # municipality of Germany
    "Q42744322",  # urban municipality of Germany
    "Q1093829",  # city of the United States
}
# Administrative levels a city's districts usually sit at, in OpenStreetMap.
DISTRICT_LEVELS = (9, 10, 8)
# `wbgetentities` accepts at most this many ids per call (anonymous callers).
WIKIDATA_BATCH = 50
# Overpass area id of a relation: its id plus this offset.
RELATION_AREA_OFFSET = 3_600_000_000
SURE_MATCH = 0.85
POSSIBLE_MATCH = 0.6
FALLBACK_HALF_SIDE = 0.15  # degrees around the centre when no relation bounds


class DiscoveryError(RuntimeError):
    """The sources do not know the city well enough to draft anything."""


@dataclass(frozen=True)
class District:
    qid: str
    label: str
    review: bool = False


@dataclass(frozen=True)
class OsmBoundary:
    ref: str
    name: str
    admin_level: int


@dataclass(frozen=True)
class WikivoyageGuide:
    lang: str
    root: str
    subpages: tuple[str, ...]


@dataclass(frozen=True)
class CategoryProbe:
    name: str
    pages: int
    require_coordinates: bool


@dataclass
class Discovery:
    qid: str
    name: str
    aliases: tuple[str, ...]
    centre: tuple[float, float]
    country: str | None
    timezone: str | None
    osm_relation: str | None
    bbox: tuple[float, float, float, float] | None  # south, west, north, east
    districts: list[District] = field(default_factory=list)
    boundaries: list[OsmBoundary] = field(default_factory=list)
    admin_level: int | None = None
    guides: list[WikivoyageGuide] = field(default_factory=list)
    categories: list[CategoryProbe] = field(default_factory=list)
    # The city's photo: Wikidata's P18 when Commons licenses it freely (TRA-182).
    hero: HeroPhoto | None = None
    # What a human must decide, in the order the draft raises it.
    notes: list[str] = field(default_factory=list)

    @property
    def slug(self) -> str:
        return slugify(self.name)

    def note(self, message: str) -> None:
        logger.warning("%s", message)
        self.notes.append(message)


# ── Wikidata ──────────────────────────────────────────────────────────────────


def _best(claims: dict[str, Any], prop: str) -> list[Any]:
    """Values of `prop`, preferred rank first, deprecated ones dropped."""
    statements = [s for s in claims.get(prop, []) if s.get("rank") != "deprecated"]
    statements.sort(key=lambda s: s.get("rank") != "preferred")
    values = []
    for statement in statements:
        value = statement.get("mainsnak", {}).get("datavalue", {}).get("value")
        if value is not None:
            values.append(value)
    return values


def _ids(claims: dict[str, Any], prop: str) -> list[str]:
    return [v["id"] for v in _best(claims, prop) if isinstance(v, dict) and "id" in v]


def _wikidata(client: ApiClient, params: dict[str, str | int]) -> dict[str, Any]:
    """One Wikidata call; an API error is the city's problem, not a traceback."""
    try:
        return client.get(WIKIDATA_API, params).data
    except RuntimeError as exc:
        raise DiscoveryError(f"Wikidata: {exc}") from exc


def fetch_entities(
    client: ApiClient, qids: list[str], props: str, **extra: str
) -> dict[str, Any]:
    """`wbgetentities` for any number of ids, in batches the API accepts."""
    entities: dict[str, Any] = {}
    for start in range(0, len(qids), WIKIDATA_BATCH):
        batch = qids[start : start + WIKIDATA_BATCH]
        answer = _wikidata(
            client,
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": props,
                **extra,
            },
        )
        entities.update(answer.get("entities", {}))
    return entities


def find_city(client: ApiClient, name: str) -> tuple[str, dict[str, Any], list[str]]:
    """The Wikidata entity for the city, and the notes the choice raised."""
    hits = _wikidata(
        client,
        {
            "action": "wbsearchentities",
            "search": name,
            "language": "en",
            "type": "item",
            "limit": 10,
        },
    ).get("search", [])
    if not hits:
        raise DiscoveryError(f"Wikidata has no item labelled {name!r}")
    entities = fetch_entities(
        client,
        [hit["id"] for hit in hits],
        "claims|labels|sitelinks",
        languages="|".join(WIKIVOYAGE_LANGS),
        sitefilter="|".join(f"{lang}wikivoyage" for lang in WIKIVOYAGE_LANGS),
    )
    located = [
        (hit["id"], entities[hit["id"]])
        for hit in hits
        if hit["id"] in entities
        and _best(entities[hit["id"]]["claims"], "P625")
        and _ids(entities[hit["id"]]["claims"], "P17")
    ]
    if not located:
        raise DiscoveryError(f"no located place among Wikidata's hits for {name!r}")
    for qid, entity in located:
        if set(_ids(entity["claims"], "P31")) & CITY_CLASSES:
            return qid, entity, []
    qid, entity = located[0]
    classes = ", ".join(_ids(entity["claims"], "P31")) or "none"
    return qid, entity, [f"{qid} is not a known city class (instance of {classes})"]


def fetch_district_labels(client: ApiClient, qids: list[str]) -> list[District]:
    """English labels of the P150 items; another language, marked, when there is none."""
    if not qids:
        return []
    entities = fetch_entities(client, qids, "labels")
    districts: list[District] = []
    for qid in qids:
        labels = entities.get(qid, {}).get("labels", {})
        if "en" in labels:
            districts.append(District(qid, labels["en"]["value"]))
        elif labels:
            lang = sorted(labels)[0]
            districts.append(District(qid, labels[lang]["value"], review=True))
        else:
            districts.append(District(qid, qid, review=True))
    return sorted(districts, key=lambda d: d.label)


def fetch_hero(client: ApiClient, claims: dict[str, Any]) -> HeroPhoto | None:
    """The city's Wikidata image (P18), when Commons licenses it freely.

    The first claim in Wikidata's order (preferred rank first) is the curated
    one; its licence and author come from Commons, so the draft carries the
    credit the page will print. A non-free file, or none at all, leaves the
    `[hero]` table for a human to fill.
    """
    filename = next((v for v in _best(claims, IMAGE) if isinstance(v, str)), None)
    if not filename:
        return None
    try:
        info = fetch_image_info(client, [filename]).get(commons_title(filename))
    except RuntimeError as exc:
        logger.warning("Commons: %s", exc)
        return None
    if info is None or not is_free(info.licence):
        return None
    return HeroPhoto(
        file=commons_title(filename), credit=_credit(info.author, info.licence)
    )


def _credit(author: str | None, licence: str | None) -> str:
    """`"{author} ({licence}) · Wikimedia Commons"`, the format the cards use."""
    parts = [p for p in (author, f"({licence})" if licence else None) if p]
    return " ".join([*parts, "· Wikimedia Commons"]) if parts else "Wikimedia Commons"


# ── Bounds, time zone, boundaries ─────────────────────────────────────────────


def fetch_bbox(
    client: ApiClient, relation: str
) -> tuple[float, float, float, float] | None:
    """Nominatim's bounding box of an OSM relation, rounded outwards to 0.01°."""
    try:
        # Nominatim answers with a JSON array, unlike every other endpoint.
        rows: Any = client.get_json(
            NOMINATIM_URL, {"osm_ids": f"R{relation}", "format": "json"}
        ).data
    except RuntimeError as exc:
        logger.warning("Nominatim: %s", exc)
        return None
    if not isinstance(rows, list) or not rows or "boundingbox" not in rows[0]:
        return None
    south, north, west, east = (float(v) for v in rows[0]["boundingbox"])
    return (_floor(south), _floor(west), _ceil(north), _ceil(east))


def _floor(value: float) -> float:
    return math.floor(value * 100 + 1e-6) / 100


def _ceil(value: float) -> float:
    return math.ceil(value * 100 - 1e-6) / 100


def fetch_timezone(client: ApiClient, centre: tuple[float, float]) -> str | None:
    """The IANA zone Open-Meteo resolves for the centre (`timezone=auto`)."""
    lat, lon = centre
    try:
        data = client.get_json(
            FORECAST_URL,
            {
                "latitude": f"{lat:.4f}",
                "longitude": f"{lon:.4f}",
                "timezone": "auto",
                "forecast_days": 1,
            },
        ).data
    except RuntimeError as exc:
        logger.warning("Open-Meteo: %s", exc)
        return None
    zone = data.get("timezone")
    return zone if isinstance(zone, str) and "/" in zone else None


def area_selector(osm_area: str, relation: str | None) -> str:
    """The city's area by its relation id, or by name and level 8 without one
    (the same choice `sources.districts.area_selector` makes at build time)."""
    if relation:
        return f"area(id:{RELATION_AREA_OFFSET + int(relation)})->.a;"
    return f'area["name"="{osm_area}"]["admin_level"="8"]->.a;'


def fetch_boundaries(
    client: ApiClient, osm_area: str, relation: str | None = None
) -> list[OsmBoundary]:
    """Administrative relations inside the city, tags only, at the usual levels."""
    levels = "|".join(str(level) for level in DISTRICT_LEVELS)
    query = (
        f"[out:json][timeout:60];{area_selector(osm_area, relation)}"
        f'relation["boundary"="administrative"]["admin_level"~"^({levels})$"](area.a);'
        "out tags;"
    )
    try:
        elements = client.post_form(OVERPASS_URL, {"data": query}).data.get(
            "elements", []
        )
    except RuntimeError as exc:
        logger.warning("Overpass: %s", exc)
        return []
    boundaries = []
    for element in elements:
        tags = element.get("tags", {})
        if "name" not in tags or not str(tags.get("admin_level", "")).isdigit():
            continue
        boundaries.append(
            OsmBoundary(
                # The build keys a boundary by `ref`, or by name when there is none.
                ref=str(tags.get("ref") or tags["name"]),
                name=tags["name"],
                admin_level=int(tags["admin_level"]),
            )
        )
    return sorted(boundaries, key=lambda b: (b.admin_level, _ref_order(b.ref), b.name))


def _ref_order(ref: str) -> tuple[int, str]:
    return (int(ref), "") if ref.isdigit() else (10**9, ref)


# ── Wikivoyage and Wikipedia ──────────────────────────────────────────────────


def fetch_guides(
    client: ApiClient, entity: dict[str, Any], name: str
) -> list[WikivoyageGuide]:
    guides: list[WikivoyageGuide] = []
    sitelinks = entity.get("sitelinks", {})
    for lang in WIKIVOYAGE_LANGS:
        root = sitelinks.get(f"{lang}wikivoyage", {}).get("title") or _existing_title(
            client, lang, name
        )
        if not root:
            continue
        titles = wikivoyage.list_titles(client, WikivoyageSite(lang, root, True))
        subpages = tuple(t.removeprefix(root + "/") for t in titles if t != root)
        guides.append(WikivoyageGuide(lang, root, subpages))
    return guides


def _existing_title(client: ApiClient, lang: str, title: str) -> str | None:
    pages = client.get(
        wikivoyage.api_url(lang), {"action": "query", "titles": title, "redirects": 1}
    ).data["query"]["pages"]
    page = pages[0]
    return None if page.get("missing") else page["title"]


def probe_categories(client: ApiClient, lang: str, name: str) -> list[CategoryProbe]:
    """Which of the standard categories exist for the city, with their page counts."""
    wanted = {
        pattern.format(city=name): required for pattern, required in STANDARD_CATEGORIES
    }
    pages = client.get(
        wikipedia.api_url(lang),
        {
            "action": "query",
            "prop": "categoryinfo",
            "titles": "|".join(f"Category:{title}" for title in wanted),
        },
    ).data["query"]["pages"]
    found: list[CategoryProbe] = []
    for page in pages:
        title = page["title"].removeprefix("Category:")
        count = int(page.get("categoryinfo", {}).get("pages", 0))
        if page.get("missing") or count < 1 or title not in wanted:
            continue
        found.append(CategoryProbe(title, count, wanted[title]))
    order = [pattern.format(city=name) for pattern, _ in STANDARD_CATEGORIES]
    return sorted(found, key=lambda c: order.index(c.name))


# ── Orchestration ─────────────────────────────────────────────────────────────


def discover(client: ApiClient, name: str) -> Discovery:
    qid, entity, notes = find_city(client, name)
    claims = entity["claims"]
    labels = entity.get("labels", {})
    english = labels.get("en", {}).get("value", name)
    aliases = {english.lower()}
    for lang in WIKIVOYAGE_LANGS:
        if lang in labels:
            aliases.add(labels[lang]["value"].lower())
    coordinates = _best(claims, "P625")[0]
    centre = (round(coordinates["latitude"], 4), round(coordinates["longitude"], 4))
    # An external id: only a numeric one can select an Overpass area.
    relation = next((str(v) for v in _best(claims, "P402") if str(v).isdigit()), None)

    found = Discovery(
        qid=qid,
        name=english,
        aliases=tuple(sorted(aliases)),
        centre=centre,
        country=next(iter(_ids(claims, "P17")), None),
        timezone=fetch_timezone(client, centre),
        osm_relation=relation,
        bbox=fetch_bbox(client, relation) if relation else None,
    )
    for message in notes:
        found.note(message)
    if found.timezone is None:
        found.note("time zone not resolved; set `timezone` to the IANA name")
    if found.bbox is None:
        south, west = centre[0] - FALLBACK_HALF_SIDE, centre[1] - FALLBACK_HALF_SIDE
        north, east = centre[0] + FALLBACK_HALF_SIDE, centre[1] + FALLBACK_HALF_SIDE
        found.bbox = (round(south, 2), round(west, 2), round(north, 2), round(east, 2))
        found.note(
            "bbox is a square around the centre (no OSM relation bounds); check it"
        )

    found.districts = fetch_district_labels(client, _ids(claims, "P150"))
    if not found.districts:
        found.note("Wikidata lists no districts (P150) for the city")
    boundaries = fetch_boundaries(client, english, relation)
    found.admin_level = _pick_admin_level(boundaries, found.districts)
    found.boundaries = [b for b in boundaries if b.admin_level == found.admin_level]
    if found.admin_level is None:
        found.note("no district boundaries found in OpenStreetMap at levels 8-10")

    found.guides = fetch_guides(client, entity, english)
    if found.osm_relation is None:
        found.note(
            "no OSM relation (P402): set `osm_area` to the city's local OSM name"
        )
    if not any(g.lang == "en" for g in found.guides):
        found.note("no English Wikivoyage article: the corpus would have no listings")
    found.categories = probe_categories(client, "en", english)
    if len(found.categories) < 3:
        found.note("fewer than three standard Wikipedia categories exist for the city")

    found.hero = fetch_hero(client, claims)
    if found.hero is None:
        found.note(
            "no freely licensed Wikidata image (P18): fill [hero] with a photo "
            "from Wikimedia Commons"
        )
    return found


def _pick_admin_level(
    boundaries: list[OsmBoundary], districts: list[District]
) -> int | None:
    """The level whose relation names look most like Wikidata's districts."""
    by_level: dict[int, list[OsmBoundary]] = {}
    for boundary in boundaries:
        by_level.setdefault(boundary.admin_level, []).append(boundary)
    if not by_level:
        return None
    if not districts:
        return min(by_level, key=lambda level: (-len(by_level[level]), level))

    def score(level: int) -> tuple[int, int]:
        names = [b.name for b in by_level[level]]
        matched = sum(
            1 for d in districts if _match(d.label, names)[1] >= POSSIBLE_MATCH
        )
        return (matched, -abs(len(names) - len(districts)))

    return max(sorted(by_level), key=score)


def _match(name: str, candidates: list[str]) -> tuple[str | None, float]:
    """The candidate most like `name` and how alike (0-1), on folded slugs."""
    best, ratio = None, 0.0
    target = _fold(name)
    for candidate in candidates:
        folded = _fold(candidate)
        current = SequenceMatcher(None, target, folded).ratio()
        if target and (target in folded or folded in target):
            current = max(current, 0.9)
        if current > ratio:
            best, ratio = candidate, current
    return best, ratio


def _fold(value: str) -> str:
    # Drop the generic words the sources add to a district's name.
    words = [
        w
        for w in slugify(value).split("-")
        if w not in {"district", "quartiere", "bezirk", "kerulet", "distrito", "of"}
    ]
    return "-".join(words)


# ── The draft ─────────────────────────────────────────────────────────────────


def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _list(values: tuple[str, ...] | list[str]) -> str:
    return "[" + ", ".join(_quote(v) for v in values) + "]"


def guide_mapping(found: Discovery) -> list[tuple[str, list[str], str]]:
    """(key, guide names, comment) rows for `[district_guides]`.

    Keys are the OSM `ref` of each boundary, or its name when it has none (what
    the build joins on). With English Wikivoyage district pages, each boundary
    maps to the page most like its name; without them, every boundary is its own
    district. Without boundaries at all, Wikidata's districts stand in, marked.
    """
    english = next((g for g in found.guides if g.lang == "en"), None)
    subpages = list(english.subpages) if english else []
    rows: list[tuple[str, list[str], str]] = []
    keyed = found.boundaries or [
        OsmBoundary(ref=d.label, name=d.label, admin_level=0) for d in found.districts
    ]
    for boundary in keyed:
        key = boundary.ref
        comment = "" if found.boundaries else "# review: no OSM boundary found"
        if not subpages:
            rows.append((key, [boundary.name], comment))
            continue
        page, ratio = _match(boundary.name, subpages)
        if page is None or ratio < POSSIBLE_MATCH:
            rows.append((key, [], _join(comment, f"no guide like {boundary.name!r}")))
        elif ratio < SURE_MATCH:
            rows.append((key, [page], _join(comment, f"{boundary.name!r} → {page!r}?")))
        else:
            rows.append((key, [page], comment))
    return rows


def _join(comment: str, review: str) -> str:
    """One `# review` comment carrying both reasons."""
    return f"{comment}; {review}" if comment else f"# review: {review}"


def district_names(found: Discovery) -> list[str]:
    english = next((g for g in found.guides if g.lang == "en"), None)
    if english and english.subpages:
        return sorted(english.subpages)
    if found.boundaries:
        return sorted({b.name for b in found.boundaries})
    return sorted(d.label for d in found.districts)


def render(found: Discovery) -> str:
    """The draft TOML, comments included."""
    lines = [
        f"# Draft for {found.name} (Wikidata {found.qid}), written by",
        "# `python -m city_corpus discover`. Resolve every `# review` line, then rename",
        f"# this file to cities/{found.slug}.toml and run `just corpus {found.slug}`.",
    ]
    for message in found.notes:
        lines.append(f"# review: {message}")
    review_tz = "  # review" if found.timezone is None else ""
    review_level = "  # review" if found.admin_level is None else ""
    if found.osm_relation:
        area = [
            "# OpenStreetMap relation of the city (Wikidata P402): selects the area"
            " for the boundaries and the place queries.",
            f"osm_relation = {int(found.osm_relation)}",
            "# Only used when `osm_relation` is unset.",
            f"osm_area = {_quote(found.name)}",
        ]
    else:
        area = [
            f"osm_area = {_quote(found.name)}  # review: must be the local OSM `name`"
            " of the city's admin_level=8 relation, or set `osm_relation`",
        ]
    lines += [
        "",
        f"slug = {_quote(found.slug)}",
        f"name = {_quote(found.name)}",
        f"aliases = {_list(found.aliases)}",
        'language = "en"',
        'wikipedia_lang = "en"',
        *area,
        f"district_admin_level = {found.admin_level or 9}{review_level}",
        f"centre = [{found.centre[0]}, {found.centre[1]}]",
        f"timezone = {_quote(found.timezone or 'UTC')}{review_tz}",
    ]
    if found.districts:
        lines.append(
            "# Wikidata districts (P150): "
            + ", ".join(
                f"{d.label} ({d.qid}{', review label' if d.review else ''})"
                for d in found.districts
            )
        )
    lines.append("districts = [")
    lines += [f"    {_quote(name)}," for name in district_names(found)]
    lines.append("]")
    if not found.guides:
        # A top-level key: it must come before the first table to stay one.
        lines += [
            "# review: no Wikivoyage article found; add [[wikivoyage]] tables by hand",
            "wikivoyage = []",
        ]

    south, west, north, east = found.bbox or (0.0, 0.0, 0.0, 0.0)
    source = (
        f"OSM relation {found.osm_relation} (Nominatim), rounded outwards"
        if found.osm_relation
        else "a square around the centre"
    )
    lines += [
        "",
        f"# From {source}.",
        "[bbox]",
        f"south = {south}",
        f"west = {west}",
        f"north = {north}",
        f"east = {east}",
        "",
    ]
    if found.hero:
        lines += [
            "# The city's photo, shown on the trip overview: the Wikidata image (P18),"
            " free on Commons.",
            "[hero]",
            f"file = {_quote(found.hero.file)}",
            f"credit = {_quote(found.hero.credit)}",
        ]
    else:
        lines += [
            "# review: no freely licensed Wikidata image (P18); pick a photo of the"
            " city on Commons, its file name without `File:` and the credit line",
            "[hero]",
            'file = ""  # review',
            'credit = ""  # review',
        ]
    for guide in found.guides:
        subpages = (
            f"  # {len(guide.subpages)} district pages"
            if guide.subpages
            else "  # no district pages"
        )
        lines += [
            "",
            "[[wikivoyage]]",
            f"lang = {_quote(guide.lang)}",
            f"root = {_quote(guide.root)}",
            f"include_subpages = {'true' if guide.subpages else 'false'}{subpages}",
        ]
    if not found.categories:
        lines += [
            "",
            "# review: no standard Wikipedia category exists; add"
            " [[wikipedia.categories]] tables by hand",
            "[wikipedia]",
            "categories = []",
        ]
    for category in found.categories:
        lines += [
            "",
            f"# {category.pages} pages",
            "[[wikipedia.categories]]",
            f"name = {_quote(category.name)}",
        ]
        if category.require_coordinates:
            lines.append("require_coordinates = true")
    if not found.boundaries:
        keyed_by = "Wikidata district label (no OSM boundary found)"
    elif all(b.ref != b.name for b in found.boundaries):
        keyed_by = "OSM district `ref`"
    else:
        keyed_by = "OSM district name (the boundaries carry no `ref` tag)"
    lines += [
        "",
        f"# {keyed_by} → the Wikivoyage guide(s) covering it.",
        "[district_guides]",
    ]
    for key, names, comment in guide_mapping(found):
        suffix = f"  {comment}" if comment else ""
        lines.append(f"{_quote(key)} = {_list(names)}{suffix}")
    return "\n".join(lines) + "\n"


def write_draft(found: Discovery, folder: Path = CITIES_DIR) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{found.slug}.draft.toml"
    path.write_text(render(found), encoding="utf-8")
    return path


def summary(found: Discovery) -> str:
    """What was found, for the terminal."""
    guides = ", ".join(
        f"{g.lang}:{g.root} ({len(g.subpages)} district pages)" for g in found.guides
    )
    lines = [
        f"{found.name} ({found.qid}) centre {found.centre} tz {found.timezone or '?'}",
        f"districts: {len(found.districts)} in Wikidata, "
        f"{len(found.boundaries)} OSM boundaries at level {found.admin_level or '?'}",
        f"wikivoyage: {guides or 'none'}",
        f"wikipedia categories: {len(found.categories)} "
        f"({sum(c.pages for c in found.categories)} pages)",
        f"hero photo: {found.hero.file if found.hero else 'none (review [hero])'}",
    ]
    if found.notes:
        lines.append("to review:")
        lines += [f"  - {note}" for note in found.notes]
    return "\n".join(lines)
