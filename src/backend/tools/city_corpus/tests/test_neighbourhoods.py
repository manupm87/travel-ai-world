"""Neighbourhood documents for a city without Wikivoyage district pages (Bologna)."""

from dataclasses import replace
from pathlib import Path
from typing import Any

import httpx
from city_corpus.config.cities import BUDAPEST, BBox, CityConfig, WikivoyageSite
from city_corpus.http import ApiClient
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import neighbourhoods
from city_corpus.sources.districts import Boundary, parse_boundaries
from city_corpus.sources.wikipedia import WikipediaArticle
from shapely.geometry import box

BOLOGNA = CityConfig(
    slug="bologna",
    name="Bologna",
    language="en",
    bbox=BBox(south=44.42, west=11.22, north=44.56, east=11.44),
    wikivoyage=(WikivoyageSite(lang="en", root="Bologna", include_subpages=False),),
    wikipedia_lang="en",
    wikipedia_categories=(),
    osm_area="Bologna",
    country="Italy",
    country_code="IT",
    districts=("Santo Stefano", "Savena", "Navile"),
    district_admin_level=10,
    district_guides={
        "Santo Stefano": ("Santo Stefano",),
        "Savena": ("Savena",),
        "Navile": ("Navile",),
    },
)


def _boundary(name: str, wikidata: str | None) -> Boundary:
    return Boundary(ref=name, name=name, shape=box(0, 0, 1, 1), wikidata=wikidata)


def _neighbourhood(district: str) -> CorpusDocument:
    return CorpusDocument(
        doc_id=f"wv:en:Bologna/{district}#section:intro:c1",
        city="bologna",
        district=district,
        category=Category.NEIGHBOURHOOD,
        kind=Kind.PROSE,
        text="A district described by a Wikivoyage page of its own, at length.",
        heading_path=f"Bologna › {district}",
        source=Source.WIKIVOYAGE,
        source_url=f"https://en.wikivoyage.org/wiki/Bologna/{district}",
        lang="en",
    )


def test_boundaries_keep_their_wikidata_tag() -> None:
    relation: dict[str, Any] = {
        "type": "relation",
        "id": 1,
        "tags": {"name": "Savena", "wikidata": "Q3927199"},
        "members": [
            {
                "type": "way",
                "role": "outer",
                "geometry": [
                    {"lat": 44.45, "lon": 11.35},
                    {"lat": 44.45, "lon": 11.40},
                    {"lat": 44.50, "lon": 11.40},
                    {"lat": 44.45, "lon": 11.35},
                ],
            }
        ],
    }
    [boundary] = parse_boundaries({"elements": [relation]})
    assert boundary.wikidata == "Q3927199"


def test_only_districts_without_a_guide_are_wanted() -> None:
    boundaries = [
        _boundary("Santo Stefano", "Q3927195"),
        _boundary("Savena", "Q3927199"),
        _boundary("Navile", None),  # no Wikidata tag: nothing to read
    ]
    wanted = neighbourhoods.uncovered_districts(
        BOLOGNA, boundaries, [_neighbourhood("Santo Stefano")]
    )
    assert wanted == {"Savena": "Q3927199"}


def test_budapest_style_guides_are_never_wanted() -> None:
    """A guide made of several districts, or a district split between guides,
    is what Wikivoyage pages are for; Budapest asks for nothing."""
    boundaries = [
        _boundary("4", "Q1"),
        _boundary("15", "Q2"),  # North Pest = districts 4 and 15
        _boundary("1", "Q3"),  # district 1 = Budavár + Víziváros
    ]
    assert neighbourhoods.uncovered_districts(BUDAPEST, boundaries, []) == {}


def test_article_language_prefers_the_city_then_en_es_then_local() -> None:
    links = {"itwiki": "Quartiere Savena", "dewiki": "Savena (Bologna)"}
    choice = neighbourhoods.pick_article("Savena", "Q3927199", links, "en")
    assert choice is not None
    assert (choice.lang, choice.title) == ("de", "Savena (Bologna)")

    with_english = {**links, "enwiki": "Savena, Bologna"}
    choice = neighbourhoods.pick_article("Savena", "Q3927199", with_english, "en")
    assert choice is not None
    assert choice.lang == "en"

    only_voyage = {"enwikivoyage": "Bologna", "commonswiki": "Category:Savena"}
    assert neighbourhoods.pick_article("Savena", "Q", only_voyage, "en") is None


EXTRACT = """Savena (Savena in dialetto bolognese) è un quartiere del comune di Bologna.
Comprende le zone di Mazzini e San Ruffillo.


== Storia ==
Il quartiere nasce nel 1985 dalla fusione di due quartieri precedenti.


== Note ==
Riferimenti bibliografici lunghi abbastanza da superare il minimo di caratteri.
"""


def test_article_sections_become_neighbourhood_documents_of_the_district() -> None:
    article = WikipediaArticle(
        lang="it",
        page_id=1119036,
        title="Quartiere Savena",
        revision_id=7,
        extract=EXTRACT,
        wikidata="Q3927199",
        lat=None,
        lon=None,
    )
    choice = neighbourhoods.DistrictArticle("Savena", "Q3927199", "it", article.title)

    docs = neighbourhoods.documents(choice, article, BOLOGNA)

    # The lead only: the history section would crowd the carousel search.
    assert [d.doc_id for d in docs] == ["wp:it:1119036#s0-c1"]
    lead = docs[0]
    assert (lead.category, lead.kind, lead.district, lead.name) == (
        Category.NEIGHBOURHOOD,
        Kind.PROSE,
        "Savena",
        "Savena",
    )
    assert lead.heading_path == "Bologna › Savena"
    assert lead.text.startswith("Bologna › Savena\n\nSavena (Savena in dialetto")
    assert lead.source_url == "https://it.wikipedia.org/wiki/Quartiere_Savena"
    assert (lead.lang, lead.wikidata, lead.source) == (
        "it",
        "Q3927199",
        Source.WIKIPEDIA,
    )


def test_fetch_reads_sitelinks_then_the_article(tmp_path: Path) -> None:
    def answers(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        if request.url.host == "www.wikidata.org":
            assert params["props"] == "sitelinks"
            return httpx.Response(
                200,
                json={
                    "entities": {
                        "Q3927199": {
                            "id": "Q3927199",
                            "sitelinks": {
                                "itwiki": {
                                    "site": "itwiki",
                                    "title": "Quartiere Savena",
                                }
                            },
                        },
                        "Q404": {"id": "Q404", "sitelinks": {}},
                    }
                },
            )
        assert request.url.host == "it.wikipedia.org"
        assert params["titles"] == "Quartiere Savena"
        return httpx.Response(
            200,
            json={
                "query": {
                    "pages": [
                        {
                            "pageid": 1119036,
                            "title": "Quartiere Savena",
                            "revisions": [{"revid": 7}],
                            "extract": EXTRACT,
                            "pageprops": {"wikibase_item": "Q3927199"},
                        }
                    ]
                }
            },
        )

    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(answers), sleep=lambda _: None
    )
    found = neighbourhoods.fetch(
        client, BOLOGNA, {"Savena": "Q3927199", "Navile": "Q404"}
    )

    assert [(choice.district, article.title) for choice, article, _ in found] == [
        ("Savena", "Quartiere Savena")
    ]


def test_a_missing_page_is_skipped(tmp_path: Path) -> None:
    def answers(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.wikidata.org":
            return httpx.Response(
                200,
                json={
                    "entities": {
                        "Q1": {
                            "id": "Q1",
                            "sitelinks": {
                                "enwiki": {"site": "enwiki", "title": "Gone"}
                            },
                        }
                    }
                },
            )
        return httpx.Response(
            200, json={"query": {"pages": [{"title": "Gone", "missing": True}]}}
        )

    client = ApiClient(
        tmp_path, transport=httpx.MockTransport(answers), sleep=lambda _: None
    )
    city = replace(
        BOLOGNA, districts=("Navile",), district_guides={"Navile": ("Navile",)}
    )
    assert neighbourhoods.fetch(client, city, {"Navile": "Q1"}) == []
