from typing import Any

import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.models import ODBL, Category, CorpusDocument, Kind, Source
from city_corpus.sources import osm


class FixedDistrict:
    def locate(self, lat: float, lon: float) -> str | None:
        return "Belváros"


def _node(osm_id: int, lat: float, lon: float, **tags: str) -> dict[str, Any]:
    return {"type": "node", "id": osm_id, "lat": lat, "lon": lon, "tags": tags}


def _listing(**overrides: Any) -> CorpusDocument:
    fields: dict[str, Any] = {
        "doc_id": "wv:en:Budapest/Belváros#eat:cafe-gerbeaud",
        "city": "budapest",
        "district": "Belváros",
        "category": Category.EAT,
        "kind": Kind.LISTING,
        "name": "Café Gerbeaud",
        "text": "Café Gerbeaud\nBudapest › Belváros › Eat\nFamous confectionery since 1858.",
        "heading_path": "Budapest › Belváros › Eat",
        "lat": 47.49720,
        "lon": 19.04980,
        "source": Source.WIKIVOYAGE,
        "source_url": "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#Eat",
        "lang": "en",
    }
    return CorpusDocument.model_validate({**fields, **overrides})


QUERY = {q.key: q for q in osm.QUERIES}


def test_places_keep_named_useful_elements_once() -> None:
    stats = osm.OsmStats()
    responses = [
        (
            QUERY["see"],
            {
                "osm3s": {"timestamp_osm_base": "2026-09-17T10:00:00Z"},
                "elements": [
                    _node(
                        1,
                        47.5,
                        19.05,
                        name="Memorial",
                        historic="memorial",
                        wikidata="Q1",
                    ),
                    _node(
                        2, 47.5, 19.05, historic="memorial", wikidata="Q2"
                    ),  # no name
                    _node(
                        3, 47.5, 19.05, name="Plaque", historic="memorial"
                    ),  # nothing useful
                    _node(
                        4,
                        47.5,
                        19.05,
                        name="Art Shop",
                        tourism="gallery",
                        website="https://a.hu",
                    ),
                    _node(
                        5, 47.5, 19.05, name="Ludwig", tourism="gallery", wikidata="Q5"
                    ),
                    _node(
                        6,
                        40.0,
                        3.0,
                        name="Far",
                        tourism="museum",
                        website="https://f.es",
                    ),
                ],
            },
        ),
        (
            QUERY["baths"],
            {
                "elements": [
                    _node(
                        1,
                        47.5,
                        19.05,
                        name="Memorial",
                        historic="memorial",
                        wikidata="Q1",
                    ),
                    _node(
                        7,
                        47.5,
                        19.05,
                        name="School pool",
                        leisure="sports_centre",
                        sport="swimming",
                        opening_hours="Mo 08:00-12:00",
                    ),
                    _node(
                        8,
                        47.5,
                        19.05,
                        name="Dandár Gyógyfürdő",
                        leisure="sports_centre",
                        sport="swimming",
                        opening_hours="Mo-Su 06:00-20:00",
                    ),
                ],
            },
        ),
    ]
    found = osm.places(responses, BUDAPEST, stats)

    assert [p.osm_id for p in found] == ["node/1", "node/5", "node/8"]
    assert found[0].category == Category.SEE  # first query wins
    assert stats.outside_bbox == 1
    assert stats.timestamp == "2026-09-17T10:00:00Z"


def test_small_memorials_are_not_sights() -> None:
    """Stumbling stones and wall plaques carry a name and a website (Berlin: 6,504
    of them would have become `see` documents), yet nobody visits one."""
    memorial = {"historic": "memorial", "website": "https://www.stolpersteine.de"}
    elements = [
        _node(1, 47.5, 19.05, name="Anna Levy", memorial="stolperstein", **memorial),
        _node(2, 47.5, 19.05, name="Here lived X", memorial="plaque", **memorial),
        _node(
            3, 47.5, 19.05, name="Shoes on the Danube", memorial="sculpture", **memorial
        ),
    ]
    found = osm.places(
        [(QUERY["see"], {"elements": elements})], BUDAPEST, osm.OsmStats()
    )

    assert [p.osm_id for p in found] == ["node/3"]


def test_names_match_normalised_and_contained() -> None:
    assert osm.names_match("Café Gerbeaud", "cafe gerbeaud")
    assert osm.names_match("Gerbeaud Cukrászda", "Gerbeaud")  # 8 chars, whole words
    assert not osm.names_match("Bar", "Bar Pinball")  # too short to contain
    assert not osm.names_match("Gerbeaud", "Gerbeaudx")


def _place(
    osm_id: str, lat: float, lon: float, category: Category, **tags: str
) -> osm.OsmPlace:
    return osm.OsmPlace(
        osm_id=osm_id, category=category, name=tags["name"], lat=lat, lon=lon, tags=tags
    )


def test_merge_enriches_matches_and_creates_the_rest() -> None:
    documents = [
        _listing(),
        _listing(
            doc_id="wv:en:x#see:basilica",
            name="St Stephen's Basilica",
            wikidata="Q756",
            category=Category.SEE,
            lat=47.5008,
            lon=19.0539,
        ),
    ]
    found = [
        # ~30 m away, same name → merge; fills only empty fields.
        _place(
            "node/10",
            47.49745,
            19.04990,
            Category.EAT,
            name="Gerbeaud Cukrászda",
            **{"name:en": "Cafe Gerbeaud"},
            opening_hours="Mo-Su 09:00-20:00",
            cuisine="coffee_shop;cake",
            wikidata="Q1054011",
        ),
        # Same Wikidata id, far away → still the same entity.
        _place(
            "way/11",
            47.60,
            19.20,
            Category.SEE,
            name="Szent István-bazilika",
            wikidata="Q756",
            wheelchair="yes",
        ),
        # Same name but 200 m away → a different place.
        _place(
            "node/12",
            47.4990,
            19.0498,
            Category.EAT,
            name="Café Gerbeaud",
            cuisine="coffee_shop",
        ),
        _place(
            "way/13",
            47.51,
            19.05,
            Category.SLEEP,
            name="Hotel Astra",
            tourism="hotel",
            stars="4",
            website="https://astra.hu",
            **{
                "addr:street": "Vám utca",
                "addr:housenumber": "6",
                "addr:postcode": "1011",
            },
        ),
        _place("node/14", 47.51, 19.05, Category.DRINK, name="X", opening_hours="24/7"),
    ]
    stats = osm.OsmStats()
    new = osm.merge(documents, found, BUDAPEST, FixedDistrict(), stats)  # type: ignore[arg-type]

    gerbeaud, basilica = documents
    assert (gerbeaud.osm_id, gerbeaud.wikidata, gerbeaud.cuisine) == (
        "node/10",
        "Q1054011",
        "coffee shop, cake",
    )
    assert gerbeaud.opening_hours == "Mo-Su 09:00-20:00"
    assert (basilica.osm_id, basilica.wheelchair) == ("way/11", "yes")

    assert [d.doc_id for d in new] == ["osm:node/12", "osm:way/13", "osm:node/14"]
    hotel = new[1]
    assert hotel.text == (
        "Hotel Astra — hotel in Belváros, Budapest. Stars: 4. "
        "Address: Vám utca 6, 1011."
    )
    assert (hotel.price_tier, hotel.district, hotel.license) == (3, "Belváros", ODBL)
    assert hotel.source == Source.OPENSTREETMAP
    assert hotel.source_url == "https://www.openstreetmap.org/way/13"
    assert hotel.url == "https://astra.hu"
    assert hotel.heading_path == "Budapest › Belváros › Sleep"
    assert (stats.merged, stats.new) == (2, 3)


@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ({"contact:facebook": "HotelGellert"}, "https://www.facebook.com/HotelGellert"),
        (
            {"contact:facebook": "https://www.facebook.com/HotelGellert"},
            "https://www.facebook.com/HotelGellert",
        ),
        (
            {"contact:facebook": "http://facebook.com/HotelGellert"},
            "https://facebook.com/HotelGellert",
        ),
        (
            {"facebook": "www.facebook.com/HotelGellert"},
            "https://www.facebook.com/HotelGellert",
        ),
        # `contact:facebook` wins over the bare tag.
        (
            {"contact:facebook": "First", "facebook": "Second"},
            "https://www.facebook.com/First",
        ),
        ({"facebook": "Hotel Gellert"}, None),  # a caption, not a page
        ({}, None),
    ],
)
def test_facebook_pages_are_absolute_urls(
    tags: dict[str, str], expected: str | None
) -> None:
    place = _place("node/50", 47.5, 19.05, Category.SLEEP, name="Hotel Gellért", **tags)
    document = osm.merge([], [place], BUDAPEST, FixedDistrict(), osm.OsmStats())[0]  # type: ignore[arg-type]

    assert document.facebook == expected


def test_facebook_alone_does_not_make_a_document() -> None:
    """A venue known by nothing but a Facebook page is not a venue (the tag is
    not in `USEFUL_TAGS`); one that is already a document keeps its page."""
    stats = osm.OsmStats()
    elements = [
        _node(60, 47.5, 19.05, name="Only Facebook", tourism="hotel", facebook="Only"),
        _node(
            61,
            47.5,
            19.05,
            name="Hotel Kept",
            tourism="hotel",
            website="https://kept.hu",
            **{"contact:facebook": "HotelKept"},
        ),
    ]
    found = osm.places([(QUERY["sleep"], {"elements": elements})], BUDAPEST, stats)

    assert [p.name for p in found] == ["Hotel Kept"]
    [document] = osm.merge([], found, BUDAPEST, FixedDistrict(), osm.OsmStats())  # type: ignore[arg-type]
    assert document.facebook == "https://www.facebook.com/HotelKept"


def test_facebook_reaches_a_document_the_element_only_enriches() -> None:
    documents = [_listing(category=Category.SLEEP, name="Hotel Gellért")]
    place = _place(
        "node/70",
        47.49720,
        19.04980,
        Category.SLEEP,
        name="Hotel Gellért",
        **{"contact:facebook": "HotelGellert"},
    )

    assert (
        osm.merge(documents, [place], BUDAPEST, FixedDistrict(), osm.OsmStats()) == []  # type: ignore[arg-type]
    )
    assert documents[0].facebook == "https://www.facebook.com/HotelGellert"


@pytest.mark.parametrize(
    ("stars", "tier"), [("2", 1), ("3", 2), ("4S", 3), ("5", 3), (None, None)]
)
def test_price_tier_from_stars(stars: str | None, tier: int | None) -> None:
    assert osm._stars_tier(stars) == tier


def test_link_wikidata_by_name_and_distance() -> None:
    documents = [
        _listing(
            name="Hungarian National Museum",
            alt="Magyar Nemzeti Múzeum",
            category=Category.SEE,
            lat=47.4910,
            lon=19.0620,
        ),
        _listing(doc_id="wv:en:x#see:far", name="Far Museum", lat=47.40, lon=19.00),
    ]
    overpass = {
        "elements": [
            _node(
                1, 47.4912, 19.0622, name="Magyar Nemzeti Múzeum", wikidata="Q914141"
            ),
            _node(2, 47.4006, 19.0000, name="Far Museum", wikidata="Q2"),  # ~67 m away
            _node(3, 47.4100, 19.0000, name="Far Museum", wikidata="Q3"),  # 1 km away
        ]
    }
    assert osm.link_wikidata(documents, overpass) == 2
    assert [d.wikidata for d in documents] == ["Q914141", "Q2"]
