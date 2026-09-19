from city_corpus.config.cities import BUDAPEST
from city_corpus.models import Category
from city_corpus.sources.wikipedia import WikipediaArticle, parse_article

EXTRACT = """The Chain Bridge is a suspension bridge over the Danube in Budapest.
It opened in 1849.


== History ==
Count István Széchenyi promoted the bridge after being delayed by ice for a week.


=== Destruction ===
Retreating German troops blew it up in 1945; it was rebuilt by 1949.


== References ==
Some book, ISBN 963007236 {{isbn}}: Check isbn value: length (help)
"""


def _article(
    lat: float | None = 47.4989, lon: float | None = 19.0439
) -> WikipediaArticle:
    return WikipediaArticle(
        lang="en",
        page_id=123,
        title="Széchenyi Chain Bridge",
        revision_id=9,
        extract=EXTRACT,
        wikidata="Q12345",
        lat=lat,
        lon=lon,
    )


def test_sections_become_chunks() -> None:
    docs = {d.doc_id: d for d in parse_article(_article(), BUDAPEST)}

    assert sorted(docs) == ["wp:en:123#s0-c1", "wp:en:123#s1-c1", "wp:en:123#s2-c1"]
    lead = docs["wp:en:123#s0-c1"]
    assert lead.category == Category.SEE
    assert lead.text == (
        "Széchenyi Chain Bridge\n\n"
        "The Chain Bridge is a suspension bridge over the Danube in Budapest.\n\n"
        "It opened in 1849."
    )
    assert (lead.lat, lead.lon, lead.wikidata) == (47.4989, 19.0439, "Q12345")
    assert (
        lead.source_url == "https://en.wikipedia.org/wiki/Sz%C3%A9chenyi_Chain_Bridge"
    )

    destruction = docs["wp:en:123#s2-c1"]
    assert destruction.category == Category.HISTORY
    assert destruction.heading_path == "Széchenyi Chain Bridge › History › Destruction"
    assert destruction.source_url.endswith("#Destruction")


def test_infrastructure_articles_are_transport_not_sights() -> None:
    """`Buildings and structures in Bologna` files the airport next to the palaces."""
    from dataclasses import replace

    airport = replace(_article(), title="Bologna Guglielmo Marconi Airport")
    docs = parse_article(airport, BUDAPEST)
    assert docs and all(d.category == Category.TRANSPORT for d in docs)

    mall = replace(_article(), title="Arena Mall (Budapest)")
    assert parse_article(mall, BUDAPEST)[0].category == Category.SEE


def test_coordinates_outside_the_city_are_dropped() -> None:
    docs = parse_article(_article(lat=47.62, lon=19.5), BUDAPEST)
    assert all(d.lat is None and d.lon is None for d in docs)


def test_is_located_needs_coordinates_inside_the_city() -> None:
    from city_corpus.sources.wikipedia import is_located

    assert is_located(_article(), BUDAPEST)
    assert not is_located(_article(lat=None, lon=None), BUDAPEST)
    assert not is_located(_article(lat=47.62, lon=19.5), BUDAPEST)  # outside the bbox


def test_broad_categories_require_coordinates() -> None:
    """`Buildings and structures in Budapest` also holds embassies and offices."""
    by_name = {c.name: c for c in BUDAPEST.wikipedia_categories}

    assert by_name["Buildings and structures in Budapest"].require_coordinates
    assert not by_name["Museums in Budapest"].require_coordinates
    assert not any("Hungary" in name for name in by_name), "city-scoped categories only"
