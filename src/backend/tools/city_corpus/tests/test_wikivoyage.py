from pathlib import Path

import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.models import Category, CorpusDocument, Kind
from city_corpus.normalize import MAX_CHUNK_TOKENS, estimate_tokens
from city_corpus.sources.wikivoyage import ParseStats, WikivoyagePage, parse_page

FIXTURE = Path(__file__).parent / "fixtures" / "district.wiki"


def _page() -> WikivoyagePage:
    return WikivoyagePage(
        lang="en",
        title="Budapest/Belváros",
        revision_id=1,
        wikitext=FIXTURE.read_text(encoding="utf-8"),
    )


@pytest.fixture
def parsed() -> tuple[list[CorpusDocument], ParseStats]:
    stats = ParseStats()
    return parse_page(_page(), BUDAPEST, stats), stats


def _by_id(docs: list[CorpusDocument]) -> dict[str, CorpusDocument]:
    return {d.doc_id: d for d in docs}


def test_listing_fields(parsed: tuple[list[CorpusDocument], ParseStats]) -> None:
    docs, _ = parsed
    parliament = _by_id(docs)["wv:en:Budapest/Belváros#see:parliament-building"]

    assert parliament.kind == Kind.LISTING
    assert parliament.category == Category.SEE
    assert parliament.district == "Belváros"
    assert parliament.name == "Parliament Building"
    assert parliament.alt == "Országház"
    assert (parliament.lat, parliament.lon) == (47.50711, 19.04561)
    assert parliament.url == "https://www.parlament.hu/"
    assert parliament.wikidata == "Q11819"
    assert parliament.hours == "Daily 08:00–18:00"
    assert parliament.price == "HUF 12000"
    assert parliament.directions == "Kossuth Lajos tér"
    assert parliament.heading_path == "Budapest › Belváros › See › Along the Danube"
    assert parliament.source_url == (
        "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#Along_the_Danube"
    )
    assert parliament.license == "CC BY-SA 4.0"
    assert parliament.text.splitlines()[:3] == [
        "Parliament Building (Országház)",
        "Budapest › Belváros › See › Along the Danube",
        "The largest building in Hungary.",
    ]
    assert "Price: HUF 12000." in parliament.text


def test_duplicate_names_get_distinct_ids(
    parsed: tuple[list[CorpusDocument], ParseStats],
) -> None:
    ids = _by_id(parsed[0])
    assert "wv:en:Budapest/Belváros#see:parliament-building~2" in ids


def test_categories_from_template_type_and_section(
    parsed: tuple[list[CorpusDocument], ParseStats],
) -> None:
    ids = _by_id(parsed[0])
    assert ids["wv:en:Budapest/Belváros#do:great-market-hall"].category == Category.DO
    pier = ids["wv:en:Budapest/Belváros#transport:vigado-ter-pier"]
    assert pier.category == Category.TRANSPORT
    hotel = ids["wv:en:Budapest/Belváros#sleep:hotel-central"]
    assert (hotel.category, hotel.checkin, hotel.checkout) == (
        Category.SLEEP,
        "14:00",
        "11:00",
    )


def test_price_tier_from_section(
    parsed: tuple[list[CorpusDocument], ParseStats],
) -> None:
    ids = _by_id(parsed[0])
    assert ids["wv:en:Budapest/Belváros#eat:hummus-bar"].price_tier == 1
    assert ids["wv:en:Budapest/Belváros#eat:onyx"].price_tier == 3
    assert ids["wv:en:Budapest/Belváros#sleep:hotel-central"].price_tier == 2
    assert ids["wv:en:Budapest/Belváros#see:parliament-building"].price_tier is None


def test_out_of_bbox_coordinates_and_nameless_listings_are_dropped(
    parsed: tuple[list[CorpusDocument], ParseStats],
) -> None:
    docs, stats = parsed
    castle = _by_id(docs)["wv:en:Budapest/Belváros#see:far-away-castle"]
    assert (castle.lat, castle.lon) == (None, None)
    assert stats.coordinates_outside_bbox == 1
    assert stats.listings_skipped == 1


def test_prose_sections(parsed: tuple[list[CorpusDocument], ParseStats]) -> None:
    prose = {d.doc_id: d for d in parsed[0] if d.kind == Kind.PROSE}

    intro = prose["wv:en:Budapest/Belváros#section:intro:c1"]
    assert intro.category == Category.NEIGHBOURHOOD
    assert intro.text == (
        "Budapest › Belváros\n\n"
        "Belváros or Downtown is the V. District of Budapest. It holds the "
        "Parliament and the Basilica."
    )

    get_in = prose["wv:en:Budapest/Belváros#section:get-in:c1"]
    assert get_in.category == Category.TRANSPORT
    assert "Take Deák Ferenc tér or walk 1.5 km from the river." in get_in.text

    danube = prose["wv:en:Budapest/Belváros#section:see/along-the-danube:c1"]
    assert danube.heading_path == "Budapest › Belváros › See › Along the Danube"
    assert danube.text.endswith("The promenade is best at dusk. Entry is free.")

    safe = prose["wv:en:Budapest/Belváros#section:stay-safe:c1"]
    assert safe.category == Category.PRACTICAL

    assert not any("go-next" in doc_id for doc_id in prose)
    assert all(estimate_tokens(d.text) <= MAX_CHUNK_TOKENS for d in prose.values())


def test_ids_are_stable_across_runs() -> None:
    first = [d.model_dump() for d in parse_page(_page(), BUDAPEST)]
    second = [d.model_dump() for d in parse_page(_page(), BUDAPEST)]
    assert first == second
    assert len({d["doc_id"] for d in first}) == len(first)


def test_city_page_has_no_district() -> None:
    page = WikivoyagePage(
        lang="en",
        title="Budapest",
        revision_id=1,
        wikitext="== Understand ==\nBudapest was formed in 1873 from Buda, Óbuda and Pest.",
    )
    [doc] = parse_page(page, BUDAPEST)
    assert doc.district is None
    assert doc.category == Category.HISTORY
    assert doc.heading_path == "Budapest › Understand"
