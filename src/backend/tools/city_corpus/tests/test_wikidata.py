from typing import Any

import pytest
from city_corpus.config.cities import BUDAPEST
from city_corpus.models import Category, CorpusDocument, Kind, Source
from city_corpus.sources import wikidata
from city_corpus.sources.wikidata import ImageInfo

ENTITY = {
    "id": "Q11819",
    "labels": {"es": {"language": "es", "value": "Parlamento de Budapest"}},
    "claims": {
        "P18": [
            {"rank": "normal", "mainsnak": {"datavalue": {"value": "Old view.jpg"}}},
            {
                "rank": "preferred",
                "mainsnak": {"datavalue": {"value": "Budapest Parliament.jpg"}},
            },
        ],
        "P856": [
            {
                "rank": "normal",
                "mainsnak": {"datavalue": {"value": "https://parlament.hu"}},
            }
        ],
        "P625": [
            {
                "rank": "normal",
                "mainsnak": {
                    "datavalue": {
                        "value": {"latitude": 47.50694, "longitude": 19.04556}
                    }
                },
            }
        ],
        "P1435": [
            {"rank": "deprecated", "mainsnak": {"datavalue": {"value": {"id": "Q1"}}}},
            {"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": "Q9259"}}}},
        ],
    },
}

IMAGEINFO = {
    "query": {
        "normalized": [
            {
                "from": "File:Budapest_Parliament.jpg",
                "to": "File:Budapest Parliament.jpg",
            }
        ],
        "pages": [
            {
                "title": "File:Budapest Parliament.jpg",
                "imageinfo": [
                    {
                        "extmetadata": {
                            "LicenseShortName": {"value": "CC BY-NC 2.0"},
                            "Artist": {"value": '<a href="//commons">Someone</a>'},
                        }
                    }
                ],
            },
            {
                "title": "File:Parliament from the river.jpg",
                "imageinfo": [
                    {
                        "extmetadata": {
                            "LicenseShortName": {"value": "CC BY-SA 4.0"},
                            "Artist": {"value": "<span>Jane &amp; Joe</span>"},
                        }
                    }
                ],
            },
            {"title": "File:Missing.jpg", "missing": True},
        ],
    }
}


def _doc(**overrides: Any) -> CorpusDocument:
    fields: dict[str, Any] = {
        "doc_id": "wv:en:Budapest/Belváros#see:parliament",
        "city": "budapest",
        "category": Category.SEE,
        "kind": Kind.LISTING,
        "name": "Parliament",
        "text": "Parliament (Országház)\nBudapest › Belváros › See\nThe largest building.",
        "heading_path": "Budapest › Belváros › See",
        "source": Source.WIKIVOYAGE,
        "source_url": "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#See",
        "lang": "en",
        "wikidata": "Q11819",
        "image": "Parliament_from_the_river.jpg",
    }
    return CorpusDocument.model_validate({**fields, **overrides})


def test_parse_entity_prefers_preferred_rank_and_skips_deprecated() -> None:
    entity = wikidata.parse_entity("Q11819", ENTITY)
    assert entity.images == ("Budapest Parliament.jpg", "Old view.jpg")
    assert entity.website == "https://parlament.hu"
    assert (entity.lat, entity.lon) == (47.50694, 19.04556)
    assert entity.heritage_ids == ("Q9259",)
    assert entity.label_es == "Parlamento de Budapest"


def test_image_info_is_keyed_by_requested_and_normalised_titles() -> None:
    infos = wikidata.parse_image_info(IMAGEINFO)
    assert infos["Budapest Parliament.jpg"] == ImageInfo("CC BY-NC 2.0", "Someone")
    assert infos["Parliament from the river.jpg"] == ImageInfo(
        "CC BY-SA 4.0", "Jane & Joe"
    )
    assert infos["Missing.jpg"] is None


@pytest.mark.parametrize(
    ("licence", "free"),
    [
        ("CC BY-SA 4.0", True),
        ("CC BY 2.5 hu", True),
        ("CC0", True),
        ("Public domain", True),
        ("GFDL 1.2", True),
        ("CC BY-NC 2.0", False),
        ("CC BY-NC-SA 3.0", False),
        ("CC BY-ND 4.0", False),
        ("Fair use", False),
        ("", False),
    ],
)
def test_is_free(licence: str, free: bool) -> None:
    assert wikidata.is_free(licence) is free


def test_enrich_skips_non_free_image_and_fills_only_missing_fields() -> None:
    entities = {"Q11819": wikidata.parse_entity("Q11819", ENTITY)}
    images = wikidata.parse_image_info(IMAGEINFO)
    stats = wikidata.WikidataStats()
    doc = _doc(url="https://own.example")

    enriched = wikidata.enrich(
        doc, BUDAPEST, entities, {"Q9259": "World Heritage Site"}, images, stats
    )

    # P18 is NC-licensed → skipped; the listing's own Commons file is used instead.
    assert enriched.image_url == (
        "https://commons.wikimedia.org/w/index.php"
        "?title=Special:FilePath/Parliament_from_the_river.jpg&width=640"
    )
    assert (enriched.image_license, enriched.image_author) == (
        "CC BY-SA 4.0",
        "Jane & Joe",
    )
    assert stats.images_non_free == 1
    assert enriched.url == "https://own.example"  # kept
    assert (enriched.lat, enriched.lon) == (47.50694, 19.04556)  # was missing
    assert enriched.name_es == "Parlamento de Budapest"
    assert enriched.heritage == "World Heritage Site"
    assert enriched.entity_id == "Q11819"


def test_enrich_keeps_existing_coordinates_and_needs_a_known_image() -> None:
    entities = {"Q11819": wikidata.parse_entity("Q11819", ENTITY)}
    doc = _doc(lat=47.5, lon=19.04, image=None)
    enriched = wikidata.enrich(
        doc, BUDAPEST, entities, {}, {}, wikidata.WikidataStats()
    )
    assert (enriched.lat, enriched.lon) == (47.5, 19.04)
    assert enriched.image_url is None
