"""`application.card_detail.CardDetailLookup`: the store answers, and the
card is pictured the way the carousel's are (TRA-178)."""

from pathlib import Path

import pytest
from ai_api.application.card_detail import CardDetailLookup
from ai_api.application.tracing import TurnTracer, use_tracer
from ai_api.domain.models import Document, Photo
from ai_api.testing import (
    BUDAPEST,
    FakePhotoFinder,
    FakeRetriever,
    FakeSitePreviews,
    documents_from_corpus,
)
from travel_common.exceptions import EntityNotFound

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"

MAZEL_TOV = "osm:node/3990944430"
"""A bar the corpus has no photo of — like 788 of Budapest's 814."""

FOUR_SEASONS = "wv:en:Budapest/Belváros#sleep:four-seasons-hotel-gresham-palace"
"""A hotel the corpus does picture."""

BAR_PHOTO = Photo(url="https://example.org/mazel.jpg", credit="Someone (CC BY-SA 4.0)")


@pytest.fixture(scope="module")
def corpus() -> list[Document]:
    return list(documents_from_corpus(FIXTURE))


MAZEL_TOV_SITE = "https://mazeltov.hu/en/"
"""The bar's own site, as the corpus document carries it."""

SITE_PHOTO = Photo(url="https://mazeltov.hu/garden.jpg", credit="mazeltov.hu")


def _lookup(
    corpus: list[Document],
    finder: FakePhotoFinder | None = None,
    previews: FakeSitePreviews | None = None,
) -> CardDetailLookup:
    return CardDetailLookup(
        FakeRetriever(corpus), photos=finder, previews=previews, cities=(BUDAPEST,)
    )


async def test_a_place_the_corpus_has_no_photo_of_is_looked_up(
    corpus: list[Document],
) -> None:
    """Otherwise the panel of a restaurant, a bar or a hotel would be blank."""
    finder = FakePhotoFinder({"Mazel Tov": BAR_PHOTO})

    detail = await _lookup(corpus, finder)(MAZEL_TOV)

    assert detail.image_url == BAR_PHOTO.url
    assert detail.image_credit == BAR_PHOTO.credit
    assert finder.lookups == [("Mazel Tov", 47.500231, 19.065616)]


async def test_the_lookup_asks_for_the_city_s_name_not_its_slug(
    corpus: list[Document],
) -> None:
    """The slug is what the corpus stores; Commons searches for `Budapest`."""
    finder = FakePhotoFinder()

    await _lookup(corpus, finder)(MAZEL_TOV)

    assert finder.cities == ["Budapest"]


async def test_a_city_the_manifest_does_not_know_falls_back_to_its_slug() -> None:
    document = Document(
        id="osm:node/1",
        content="A bar in some town.",
        metadata={"city": "elsewhere", "name": "Bar", "lat": 1.0, "lon": 2.0},
    )
    finder = FakePhotoFinder()

    await CardDetailLookup(
        FakeRetriever([document]), photos=finder, cities=(BUDAPEST,)
    )("osm:node/1")

    assert finder.cities == ["elsewhere"]


async def test_a_pictured_document_is_not_looked_up(corpus: list[Document]) -> None:
    finder = FakePhotoFinder()

    detail = await _lookup(corpus, finder)(FOUR_SEASONS)

    assert detail.image_url is not None
    assert "Gresham" in detail.image_url
    assert finder.lookups == []


async def test_without_a_finder_the_photo_stays_empty(corpus: list[Document]) -> None:
    """Never the placeholder: the client's own card may hold a better picture,
    and a merged detail must not paint over it."""
    detail = await _lookup(corpus)(MAZEL_TOV)

    assert detail.image_url is None
    assert detail.image_credit is None


async def test_the_venues_own_site_is_asked_when_commons_finds_nothing(
    corpus: list[Document],
) -> None:
    """Like the carousel's cards (TRA-206): the bar's own link preview."""
    previews = FakeSitePreviews({MAZEL_TOV_SITE: SITE_PHOTO})

    detail = await _lookup(corpus, FakePhotoFinder(), previews)(MAZEL_TOV)

    assert previews.lookups == [MAZEL_TOV_SITE]
    assert detail.image_url == SITE_PHOTO.url
    assert detail.image_credit == "mazeltov.hu"


async def test_a_photo_that_is_not_found_leaves_the_card_empty(
    corpus: list[Document],
) -> None:
    """Neither Commons nor the venue's own site: no photo, no placeholder."""
    previews = FakeSitePreviews()

    detail = await _lookup(corpus, FakePhotoFinder(), previews)(MAZEL_TOV)

    assert previews.lookups == [MAZEL_TOV_SITE]
    assert detail.image_url is None
    assert detail.image_credit is None


async def test_the_article_is_there_whatever_the_photo(corpus: list[Document]) -> None:
    detail = await _lookup(corpus, FakePhotoFinder({"Mazel Tov": BAR_PHOTO}))(MAZEL_TOV)

    assert detail.id == MAZEL_TOV
    assert detail.title == "Mazel Tov"
    assert detail.description.startswith("Mazel Tov — bar in Erzsébetváros")
    assert detail.address == "Akácfa utca 47, 1073"
    assert detail.why == ""  # the model writes it per turn; the store cannot


async def test_an_id_the_index_does_not_hold_is_not_found(
    corpus: list[Document],
) -> None:
    with pytest.raises(EntityNotFound):
        await _lookup(corpus, FakePhotoFinder())("osm:node/made-up")


def _tool_spans(tracer: TurnTracer) -> list[tuple[str, dict[str, object]]]:
    return [(span.name, span.payload) for span in tracer.spans if span.kind == "tool"]


async def test_the_trace_names_the_site_preview_only_when_it_was_asked(
    corpus: list[Document],
) -> None:
    """Commons found the bar's photo, so its own site was never fetched: the
    trace must not record a site preview that did not happen (TRA-220)."""
    previews = FakeSitePreviews({MAZEL_TOV_SITE: SITE_PHOTO})
    tracer = TurnTracer("card", "/cards", "user-1")

    with use_tracer(tracer):
        await _lookup(corpus, FakePhotoFinder({"Mazel Tov": BAR_PHOTO}), previews)(
            MAZEL_TOV
        )

    assert previews.lookups == []
    assert [name for name, _ in _tool_spans(tracer)] == []


async def test_the_trace_records_the_site_preview_that_was_asked(
    corpus: list[Document],
) -> None:
    previews = FakeSitePreviews()
    tracer = TurnTracer("card", "/cards", "user-1")

    with use_tracer(tracer):
        await _lookup(corpus, FakePhotoFinder(), previews)(MAZEL_TOV)

    [(name, payload)] = _tool_spans(tracer)
    assert name == "site_preview"
    assert payload["status"] == "empty" and payload["count"] == 0
    assert payload["host"] == "mazeltov.hu"
