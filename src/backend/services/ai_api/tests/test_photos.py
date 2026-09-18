"""`ensure_photos`: every card leaves with a picture (TRA-161)."""

import asyncio

import pytest
from ai_api.application.photos import (
    FALLBACK_PHOTOS,
    LOOKUPS_IN_FLIGHT,
    ensure_photos,
    fallback_photo,
)
from ai_api.domain.models import Photo
from ai_api.schemas.planner_events import OptionCard
from ai_api.testing import FakePhotoFinder

BUDAPEST = (47.4979, 19.0402)


def _card(**overrides: object) -> OptionCard:
    defaults: dict[str, object] = {
        "id": "c1",
        "title": "Card",
        "subtitle": None,
        "district": None,
        "category": "see",
        "image_url": None,
        "image_credit": None,
        "price_tier": None,
        "rating_text": None,
        "hours": None,
        "lat": None,
        "lon": None,
        "why": "",
        "source": "Wikivoyage",
        "source_url": "https://example.com",
        "license": "CC BY-SA 4.0",
        "deep_link": None,
    }
    return OptionCard(**{**defaults, **overrides})  # type: ignore[arg-type]


async def test_a_card_that_already_has_an_image_is_left_alone() -> None:
    card = _card(
        id="a",
        image_url="https://example.com/photo.jpg",
        image_credit="Someone",
        lat=BUDAPEST[0],
        lon=BUDAPEST[1],
    )
    finder = FakePhotoFinder()

    [result] = await ensure_photos([card], finder)

    assert result == card
    assert finder.lookups == []


async def test_a_card_without_an_image_is_looked_up_by_title_and_coordinates() -> None:
    card = _card(id="a", title="Náncsi néni", lat=BUDAPEST[0], lon=BUDAPEST[1])
    photo = Photo(url="https://example.com/photo.jpg", credit="Someone · Wikimedia")
    finder = FakePhotoFinder({"Náncsi néni": photo})

    [result] = await ensure_photos([card], finder)

    assert finder.lookups == [("Náncsi néni", BUDAPEST[0], BUDAPEST[1])]
    assert result.image_url == photo.url
    assert result.image_credit == photo.credit
    # Nothing else about the card changed.
    assert result.model_copy(update={"image_url": None, "image_credit": None}) == card


async def test_the_category_fallback_is_used_when_the_finder_answers_none() -> None:
    card = _card(id="a", category="eat", lat=BUDAPEST[0], lon=BUDAPEST[1])
    finder = FakePhotoFinder()  # knows nothing

    [result] = await ensure_photos([card], finder)

    assert result.image_url == FALLBACK_PHOTOS["eat"].url
    assert result.image_credit is not None
    assert result.image_credit.startswith("Illustrative photo")


async def test_the_category_fallback_is_used_when_the_card_has_no_coordinates() -> None:
    card = _card(id="a", category="drink", lat=None, lon=None)
    finder = FakePhotoFinder({"Card": Photo(url="unused", credit="unused")})

    [result] = await ensure_photos([card], finder)

    assert finder.lookups == []
    assert result.image_url == FALLBACK_PHOTOS["drink"].url
    assert result.image_credit is not None
    assert result.image_credit.startswith("Illustrative photo")


async def test_fallback_false_keeps_the_card_unchanged_when_nothing_is_found() -> None:
    card = _card(id="a", lat=BUDAPEST[0], lon=BUDAPEST[1])
    finder = FakePhotoFinder()

    [result] = await ensure_photos([card], finder, fallback=False)

    assert result == card


async def test_input_order_is_preserved() -> None:
    cards = [
        _card(id="a", lat=BUDAPEST[0], lon=BUDAPEST[1]),
        _card(id="b", image_url="https://example.com/b.jpg", image_credit="B"),
        _card(id="c", lat=BUDAPEST[0], lon=BUDAPEST[1]),
    ]
    finder = FakePhotoFinder()

    results = await ensure_photos(cards, finder)

    assert [c.id for c in results] == ["a", "b", "c"]


async def test_works_without_a_finder() -> None:
    card = _card(id="a", category="hotel", lat=BUDAPEST[0], lon=BUDAPEST[1])

    [result] = await ensure_photos([card], None)

    assert result.image_url == fallback_photo("hotel").url


async def test_no_cards_is_a_no_op() -> None:
    assert await ensure_photos([], FakePhotoFinder()) == []


async def test_never_runs_more_than_lookups_in_flight_concurrent_lookups() -> None:
    class ConcurrencyTrackingFinder:
        def __init__(self) -> None:
            self.current = 0
            self.max_seen = 0
            self._lock = asyncio.Lock()

        async def find(self, name: str, lat: float, lon: float) -> Photo | None:
            async with self._lock:
                self.current += 1
                self.max_seen = max(self.max_seen, self.current)
            await asyncio.sleep(0.02)
            async with self._lock:
                self.current -= 1
            return None

    finder = ConcurrencyTrackingFinder()
    cards = [
        _card(id=str(i), lat=BUDAPEST[0], lon=BUDAPEST[1])
        for i in range(LOOKUPS_IN_FLIGHT * 3)
    ]

    await ensure_photos(cards, finder, fallback=False)

    assert finder.max_seen == LOOKUPS_IN_FLIGHT


class TestFallbackPhoto:
    def test_unknown_category_is_the_default(self) -> None:
        assert fallback_photo("unknown-category") == FALLBACK_PHOTOS["see"]

    @pytest.mark.parametrize("category", list(FALLBACK_PHOTOS))
    def test_known_categories_return_their_own_photo(self, category: str) -> None:
        assert fallback_photo(category) == FALLBACK_PHOTOS[category]

    def test_every_fallback_url_is_a_commons_filepath(self) -> None:
        for photo in FALLBACK_PHOTOS.values():
            assert photo.url.startswith(
                "https://commons.wikimedia.org/wiki/Special:FilePath/"
            )

    def test_every_fallback_credit_names_a_licence(self) -> None:
        for photo in FALLBACK_PHOTOS.values():
            assert "(" in photo.credit and ")" in photo.credit
