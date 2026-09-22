"""Wikidata + Wikimedia Commons: images (free licences only), websites, coordinates,
Spanish names and heritage status for every document that carries a Wikidata id."""

import html
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient
from city_corpus.models import CorpusDocument

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
BATCH = 50
THUMB_WIDTH = 640
IMAGE, WEBSITE, COORDINATES, HERITAGE = "P18", "P856", "P625", "P1435"
MAX_AUTHOR_CHARS = 200

_FREE_LICENCE_RE = re.compile(
    r"^(cc0|cc-zero|cc[- ]by(-sa)?([- ]\d(\.\d)?)?|pd|public domain|gfdl|fal|attribution"
    r"|cc-pd|free art)",
    re.IGNORECASE,
)
_NON_FREE_RE = re.compile(r"(^|[- ])(nc|nd)([- ]|$)", re.IGNORECASE)


@dataclass(frozen=True)
class Entity:
    qid: str
    images: tuple[str, ...]
    website: str | None
    lat: float | None
    lon: float | None
    heritage_ids: tuple[str, ...]
    label_es: str | None


@dataclass(frozen=True)
class ImageInfo:
    licence: str
    author: str | None


@dataclass
class WikidataStats:
    images_non_free: int = 0  # candidate images skipped for their licence


def _batches(values: Iterable[str]) -> Iterator[list[str]]:
    items = sorted(set(values))
    for start in range(0, len(items), BATCH):
        yield items[start : start + BATCH]


def claim_values(claims: dict[str, Any], prop: str) -> list[Any]:
    """The values of a property, preferred statements first, deprecated ones gone."""
    statements = [s for s in claims.get(prop, []) if s.get("rank") != "deprecated"]
    # Stable sort: preferred statements first, the rest in their original order.
    statements.sort(key=lambda s: s.get("rank") != "preferred")
    return [
        s["mainsnak"]["datavalue"]["value"]
        for s in statements
        if s.get("mainsnak", {}).get("datavalue")
    ]


def parse_entity(qid: str, data: dict[str, Any]) -> Entity:
    claims = data.get("claims", {})
    coordinates = claim_values(claims, COORDINATES)
    websites = [w for w in claim_values(claims, WEBSITE) if isinstance(w, str)]
    heritage = [
        v["id"]
        for v in claim_values(claims, HERITAGE)
        if isinstance(v, dict) and "id" in v
    ]
    label = data.get("labels", {}).get("es", {}).get("value")
    return Entity(
        qid=qid,
        images=tuple(v for v in claim_values(claims, IMAGE) if isinstance(v, str)),
        website=websites[0] if websites else None,
        lat=coordinates[0]["latitude"] if coordinates else None,
        lon=coordinates[0]["longitude"] if coordinates else None,
        heritage_ids=tuple(heritage),
        label_es=label,
    )


def fetch_entities(client: ApiClient, qids: Iterable[str]) -> dict[str, Entity]:
    entities: dict[str, Entity] = {}
    for batch in _batches(qids):
        data = client.get(
            WIKIDATA_API,
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "claims|labels",
                "languages": "en|es",
            },
        ).data
        for key, entity in data.get("entities", {}).items():
            if "missing" in entity:
                continue
            parsed = parse_entity(key, entity)
            entities[key] = parsed
            entities.setdefault(entity.get("id", key), parsed)  # redirected ids
    return entities


def fetch_sitelinks(
    client: ApiClient, qids: Iterable[str]
) -> dict[str, dict[str, str]]:
    """qid → site (`enwiki`, `itwiki`, ...) → article title."""
    sitelinks: dict[str, dict[str, str]] = {}
    for batch in _batches(qids):
        data = client.get(
            WIKIDATA_API,
            {"action": "wbgetentities", "ids": "|".join(batch), "props": "sitelinks"},
        ).data
        for key, entity in data.get("entities", {}).items():
            if "missing" in entity:
                continue
            sitelinks[key] = {
                site: link["title"]
                for site, link in entity.get("sitelinks", {}).items()
                if isinstance(link, dict) and link.get("title")
            }
    return sitelinks


def fetch_labels(client: ApiClient, qids: Iterable[str]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for batch in _batches(qids):
        data = client.get(
            WIKIDATA_API,
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "labels",
                "languages": "en",
            },
        ).data
        for key, entity in data.get("entities", {}).items():
            value = entity.get("labels", {}).get("en", {}).get("value")
            if value:
                labels[key] = value
    return labels


def commons_title(filename: str) -> str:
    name = filename.strip().removeprefix("File:").replace("_", " ")
    return name[:1].upper() + name[1:]


def is_free(licence: str) -> bool:
    return bool(_FREE_LICENCE_RE.match(licence.strip())) and not _NON_FREE_RE.search(
        licence
    )


def _plain(value: str | None) -> str | None:
    if not value:
        return None
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value))).strip()
    return text[:MAX_AUTHOR_CHARS] or None


def parse_image_info(data: dict[str, Any]) -> dict[str, ImageInfo | None]:
    """Commons `imageinfo` response → info per requested title (None: missing or non-free
    metadata absent)."""
    query = data.get("query", {})
    renamed = {n["to"]: n["from"] for n in query.get("normalized", [])}
    result: dict[str, ImageInfo | None] = {}
    for page in query.get("pages", []):
        title = page["title"].removeprefix("File:")
        requested = renamed.get(page["title"], page["title"]).removeprefix("File:")
        info = (page.get("imageinfo") or [{}])[0].get("extmetadata", {})
        licence = (info.get("LicenseShortName") or {}).get("value") or (
            info.get("License") or {}
        ).get("value")
        value = (
            ImageInfo(
                licence=_plain(licence) or "",
                author=_plain((info.get("Artist") or {}).get("value")),
            )
            if licence and "missing" not in page
            else None
        )
        result[commons_title(title)] = value
        result[commons_title(requested)] = value
    return result


def fetch_image_info(
    client: ApiClient, filenames: Iterable[str]
) -> dict[str, ImageInfo | None]:
    infos: dict[str, ImageInfo | None] = {}
    for batch in _batches(commons_title(f) for f in filenames):
        data = client.get(
            COMMONS_API,
            {
                "action": "query",
                "prop": "imageinfo",
                "iiprop": "extmetadata",
                "iiextmetadatafilter": "LicenseShortName|License|Artist",
                "titles": "|".join(f"File:{name}" for name in batch),
            },
        ).data
        infos.update(parse_image_info(data))
    return infos


def thumbnail_url(filename: str, width: int = THUMB_WIDTH) -> str:
    """A Commons thumbnail of the file, `width` pixels wide: the documents' own
    images (640 px) and the city's hero photo in the cities manifest (1200 px)."""
    title = quote(commons_title(filename).replace(" ", "_"))
    return (
        "https://commons.wikimedia.org/w/index.php"
        f"?title=Special:FilePath/{title}&width={width}"
    )


def image_candidates(doc: CorpusDocument, entities: dict[str, Entity]) -> list[str]:
    """Wikidata P18 first (curated), then the listing's or OSM's own Commons file."""
    entity = entities.get(doc.wikidata or "")
    files = [*(entity.images if entity else ()), *([doc.image] if doc.image else [])]
    return list(dict.fromkeys(commons_title(f) for f in files))


def enrich(
    doc: CorpusDocument,
    city: CityConfig,
    entities: dict[str, Entity],
    heritage_labels: dict[str, str],
    images: dict[str, ImageInfo | None],
    stats: WikidataStats,
) -> CorpusDocument:
    update: dict[str, Any] = {}
    entity = entities.get(doc.wikidata or "")
    if entity is not None:
        update["entity_id"] = entity.qid
        if (
            doc.lat is None
            and entity.lat is not None
            and entity.lon is not None
            and city.bbox.contains(entity.lat, entity.lon)
        ):
            update["lat"], update["lon"] = round(entity.lat, 6), round(entity.lon, 6)
        if doc.url is None and entity.website:
            update["url"] = entity.website
        if doc.name_es is None and entity.label_es:
            update["name_es"] = entity.label_es
        heritage = [
            heritage_labels[h] for h in entity.heritage_ids if h in heritage_labels
        ]
        if doc.heritage is None and heritage:
            update["heritage"] = ", ".join(heritage)

    if doc.image_url is None:
        for filename in image_candidates(doc, entities):
            info = images.get(filename)
            if info is None:
                continue
            if not is_free(info.licence):
                stats.images_non_free += 1
                continue
            update.update(
                image_url=thumbnail_url(filename),
                image_license=info.licence,
                image_author=info.author,
            )
            break
    return doc.model_copy(update=update) if update else doc
