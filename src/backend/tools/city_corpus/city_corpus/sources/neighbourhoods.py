"""Neighbourhood documents for districts without a Wikivoyage guide.

Budapest has a Wikivoyage page per district, so its `neighbourhood` documents
come from those pages. Bologna's Wikivoyage article has no district pages at
all: the planner's neighbourhood carousel, which ranks `neighbourhood`
documents by district, would find nothing to offer. The district boundaries
carry a `wikidata` tag, and the district's Wikidata item names its Wikipedia
article (for Bologna only the Italian one exists): that article becomes the
district's neighbourhood document, in whatever language Wikipedia has it.
"""

import logging
from dataclasses import dataclass

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient
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
from city_corpus.sources import wikidata, wikipedia
from city_corpus.sources.districts import Boundary
from city_corpus.sources.wikipedia import SKIPPED_SECTIONS, WikipediaArticle

logger = logging.getLogger(__name__)

# Languages tried first for the district article; then any other Wikipedia,
# which for most cities is the local one.
PREFERRED_LANGS = ("en", "es")
# Back matter in the Wikipedias a district article is likely to come from
# (Italian, Spanish, German, French, Portuguese), next to the English set.
SKIPPED_LOCAL_SECTIONS = {
    "note",
    "bibliografia",
    "voci correlate",
    "altri progetti",
    "collegamenti esterni",
    "notas",
    "referencias",
    "bibliografía",
    "véase también",
    "enlaces externos",
    "einzelnachweise",
    "literatur",
    "weblinks",
    "siehe auch",
    "anmerkungen",
    "notes et références",
    "références",
    "bibliographie",
    "voir aussi",
    "liens externes",
    "annexes",
    "articles connexes",
    "referências",
    "ligações externas",
    "ver também",
}


@dataclass(frozen=True)
class DistrictArticle:
    district: str
    qid: str
    lang: str
    title: str


def uncovered_districts(
    city: CityConfig, boundaries: list[Boundary], documents: list[CorpusDocument]
) -> dict[str, str]:
    """district → Wikidata id, for districts no neighbourhood document describes.

    Only boundaries that map to exactly one guide, from exactly one boundary,
    qualify: a district split between guides, or a guide made of several
    districts (Budapest's `North Pest`), is what Wikivoyage pages are for.
    """
    covered = {
        d.district
        for d in documents
        if d.category == Category.NEIGHBOURHOOD and d.district
    }
    guide_boundaries: dict[str, list[Boundary]] = {}
    for boundary in boundaries:
        guides = city.district_guides.get(boundary.ref, ())
        if len(guides) == 1:
            guide_boundaries.setdefault(guides[0], []).append(boundary)
    found: dict[str, str] = {}
    for guide in city.districts:
        owners = guide_boundaries.get(guide, [])
        if guide in covered or len(owners) != 1 or not owners[0].wikidata:
            continue
        found[guide] = owners[0].wikidata
    return found


def pick_article(
    district: str, qid: str, sitelinks: dict[str, str], language: str
) -> DistrictArticle | None:
    """The Wikipedia article to read: the city's language, then English and
    Spanish, then the first other Wikipedia (alphabetically, so a rebuild picks
    the same one)."""
    langs = [language, *PREFERRED_LANGS]
    others = sorted(
        site.removesuffix("wiki")
        for site in sitelinks
        if site.endswith("wiki") and not site.endswith(("voyagewiki", "commonswiki"))
    )
    for lang in [*langs, *others]:
        title = sitelinks.get(f"{lang}wiki")
        if title:
            return DistrictArticle(district, qid, lang, title)
    return None


def fetch(
    client: ApiClient, city: CityConfig, wanted: dict[str, str]
) -> list[tuple[DistrictArticle, WikipediaArticle, str]]:
    """(what was asked, the article, fetched_at) per district with an article."""
    if not wanted:
        return []
    sitelinks = wikidata.fetch_sitelinks(client, wanted.values())
    articles: list[tuple[DistrictArticle, WikipediaArticle, str]] = []
    for district in sorted(wanted):
        qid = wanted[district]
        choice = pick_article(district, qid, sitelinks.get(qid, {}), city.language)
        if choice is None:
            logger.warning("%s (%s) has no Wikipedia article", district, qid)
            continue
        fetched = wikipedia.fetch_article_by_title(client, choice.lang, choice.title)
        if fetched is None:
            logger.warning("%s: %s:%s is missing", district, choice.lang, choice.title)
            continue
        articles.append((choice, *fetched))
    return articles


def documents(
    choice: DistrictArticle, article: WikipediaArticle, city: CityConfig
) -> list[CorpusDocument]:
    """The article's lead as `neighbourhood` prose of the district.

    Named after the district, not the article (`Santo Stefano`, not `Quartiere
    Santo Stefano`), so the carousel card reads like the district. Only the
    lead: the carousel search takes a couple of dozen neighbourhood documents,
    and a district with twenty history sections would crowd the others out.
    Coordinates and the image arrive later from the district's Wikidata item.
    """
    host = f"{article.lang}.wikipedia.org"
    claim = unique_ids()
    result: list[CorpusDocument] = []
    for index, (path, raw_body) in enumerate(wikipedia.sections(article.extract)):
        if path or any(
            h.lower() in SKIPPED_SECTIONS or h.lower() in SKIPPED_LOCAL_SECTIONS
            for h in path
        ):
            continue
        body = clean_whitespace(wikipedia.strip_template_errors(raw_body))
        if len(body) < wikipedia.MIN_SECTION_CHARS:
            continue
        heading_path = HEADING_SEPARATOR.join([city.name, choice.district, *path])
        budget = MAX_CHUNK_TOKENS - estimate_tokens(heading_path)
        lines = [line for line in body.splitlines() if line.strip()]
        for chunk_index, chunk in enumerate(
            chunk_paragraphs(lines, max_tokens=budget), start=1
        ):
            result.append(
                CorpusDocument(
                    doc_id=claim(
                        f"wp:{article.lang}:{article.page_id}#s{index}-c{chunk_index}"
                    ),
                    city=city.slug,
                    district=choice.district,
                    category=Category.NEIGHBOURHOOD,
                    kind=Kind.PROSE,
                    name=choice.district,
                    text=f"{heading_path}\n\n{chunk}",
                    heading_path=heading_path,
                    wikidata=article.wikidata or choice.qid,
                    source=Source.WIKIPEDIA,
                    source_url=wiki_url(
                        host, article.title, path[-1] if path else None
                    ),
                    lang=article.lang,
                )
            )
    return result
