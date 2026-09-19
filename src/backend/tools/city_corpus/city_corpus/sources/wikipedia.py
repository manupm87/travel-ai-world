"""Wikipedia: articles in the city's attraction categories → section chunks."""

import re
from dataclasses import dataclass

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient, Fetched
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.normalize import (
    HEADING_SEPARATOR,
    MAX_CHUNK_TOKENS,
    chunk_paragraphs,
    clean_whitespace,
    estimate_tokens,
    unique_ids,
    wiki_url,
)

# Back matter that is not about the place.
SKIPPED_SECTIONS = {
    "see also",
    "references",
    "notes",
    "external links",
    "further reading",
    "sources",
    "bibliography",
    "gallery",
    "citations",
    "footnotes",
    "literature",
    "publications",
}
MIN_SECTION_CHARS = 40
# Infrastructure that a broad category (`Buildings and structures in X`) files
# next to the sights: it is how you arrive, not what you visit.
_TRANSPORT_TITLE_RE = re.compile(
    r"\b(airport|railway station|train station|bus station|metro station"
    r"|central station|aeroporto|stazione)\b",
    re.IGNORECASE,
)
_HEADING_RE = re.compile(r"^(={2,6})\s*(.+?)\s*\1\s*$")
# Citation-template error messages that leak into plain-text extracts.
_TEMPLATE_ERROR_RE = re.compile(r"\s*\{\{[^{}]*\}\}:[^\n]*?\(help\)")


@dataclass(frozen=True)
class WikipediaArticle:
    lang: str
    page_id: int
    title: str
    revision_id: int
    extract: str
    wikidata: str | None
    lat: float | None
    lon: float | None


def api_url(lang: str) -> str:
    return f"https://{lang}.wikipedia.org/w/api.php"


def category_members(client: ApiClient, lang: str, category: str) -> list[int]:
    ids: list[int] = []
    params: dict[str, str | int] = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmnamespace": 0,
        "cmtype": "page",
        "cmlimit": 500,
    }
    while True:
        data = client.get(api_url(lang), params).data
        ids += [m["pageid"] for m in data["query"]["categorymembers"]]
        cont = data.get("continue")
        if not cont:
            return ids
        params = {**params, **cont}


def strip_template_errors(text: str) -> str:
    return _TEMPLATE_ERROR_RE.sub("", text)


def fetch_article(
    client: ApiClient, lang: str, page_id: int
) -> tuple[WikipediaArticle, str]:
    found = _fetch_article(client, lang, {"pageids": page_id})
    if found is None:
        raise RuntimeError(f"{lang}.wikipedia page {page_id} is missing")
    return found


def fetch_article_by_title(
    client: ApiClient, lang: str, title: str
) -> tuple[WikipediaArticle, str] | None:
    """The article a Wikidata sitelink names; None when the page is missing."""
    return _fetch_article(client, lang, {"titles": title, "redirects": 1})


def _fetch_article(
    client: ApiClient, lang: str, selector: dict[str, str | int]
) -> tuple[WikipediaArticle, str] | None:
    fetched: Fetched = client.get(
        api_url(lang),
        {
            "action": "query",
            "prop": "extracts|pageprops|revisions|coordinates",
            **selector,
            "explaintext": 1,
            "exsectionformat": "wiki",
            "ppprop": "wikibase_item",
            "rvprop": "ids",
            "coprimary": "primary",
        },
    )
    page = fetched.data["query"]["pages"][0]
    if page.get("missing") or "revisions" not in page:
        return None
    coordinates = page.get("coordinates") or [{}]
    return (
        WikipediaArticle(
            lang=lang,
            page_id=page["pageid"],
            title=page["title"],
            revision_id=page["revisions"][0]["revid"],
            extract=page.get("extract", ""),
            wikidata=page.get("pageprops", {}).get("wikibase_item"),
            lat=coordinates[0].get("lat"),
            lon=coordinates[0].get("lon"),
        ),
        fetched.fetched_at,
    )


def sections(extract: str) -> list[tuple[list[str], str]]:
    """(heading path below the title, body) per section; the lead has path []."""
    parts: list[tuple[list[str], list[str]]] = [([], [])]
    headings: list[tuple[int, str]] = []
    for line in extract.splitlines():
        match = _HEADING_RE.match(line.strip())
        if match:
            level = len(match.group(1))
            headings = [h for h in headings if h[0] < level]
            headings.append((level, match.group(2)))
            parts.append(([h[1] for h in headings], []))
        else:
            parts[-1][1].append(line)
    return [(path, "\n".join(lines)) for path, lines in parts]


def is_located(article: WikipediaArticle, city: CityConfig) -> bool:
    """Does the article carry coordinates inside the city?"""
    return (
        article.lat is not None
        and article.lon is not None
        and city.bbox.contains(article.lat, article.lon)
    )


def parse_article(article: WikipediaArticle, city: CityConfig) -> list[CorpusDocument]:
    host = f"{article.lang}.wikipedia.org"
    claim = unique_ids()
    in_city = is_located(article, city)
    lat = round(article.lat, 6) if in_city and article.lat is not None else None
    lon = round(article.lon, 6) if in_city and article.lon is not None else None
    is_transport = bool(_TRANSPORT_TITLE_RE.search(article.title))
    documents: list[CorpusDocument] = []
    for index, (path, raw_body) in enumerate(sections(article.extract)):
        if any(h.lower() in SKIPPED_SECTIONS for h in path):
            continue
        body = clean_whitespace(strip_template_errors(raw_body))
        if len(body) < MIN_SECTION_CHARS:
            continue
        heading_path = HEADING_SEPARATOR.join([article.title, *path])
        # Extracts separate paragraphs with a single newline.
        budget = MAX_CHUNK_TOKENS - estimate_tokens(heading_path)
        lines = [line for line in body.splitlines() if line.strip()]
        chunks = chunk_paragraphs(lines, max_tokens=budget)
        for chunk_index, chunk in enumerate(chunks, start=1):
            documents.append(
                CorpusDocument(
                    doc_id=claim(
                        f"wp:{article.lang}:{article.page_id}#s{index}-c{chunk_index}"
                    ),
                    city=city.slug,
                    category=(
                        Category.TRANSPORT
                        if is_transport
                        else Category.SEE
                        if not path
                        else Category.HISTORY
                    ),
                    kind=Kind.PROSE,
                    name=article.title,
                    text=f"{heading_path}\n\n{chunk}",
                    heading_path=heading_path,
                    lat=lat,
                    lon=lon,
                    wikidata=article.wikidata,
                    source=Source.WIKIPEDIA,
                    source_url=wiki_url(
                        host, article.title, path[-1] if path else None
                    ),
                    lang=article.lang,
                )
            )
    return documents
