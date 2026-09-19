"""`ensure_photos`: every card leaves with a picture (TRA-161, TRA-168)."""

import asyncio

from ai_api.application.photos import (
    ILLUSTRATIVE,
    LAST_RESORT,
    LOOKUPS_IN_FLIGHT,
    ensure_photos,
)
from ai_api.domain.models import Photo
from ai_api.schemas.planner_events import OptionCard
from ai_api.testing import FakePhotoFinder

BUDAPEST = (47.4979, 19.0402)
CITY = "Budapest"


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


async def _corpus_eat(card: OptionCard) -> Photo | None:
    if card.category == "eat":
        return Photo("https://c/goulash.jpg", "Kispiac · Wikivoyage")
    return None


async def test_a_card_that_already_has_an_image_is_left_alone() -> None:
    card = _card(
        id="a",
        image_url="https://example.com/photo.jpg",
        image_credit="Someone",
        lat=BUDAPEST[0],
        lon=BUDAPEST[1],
    )
    finder = FakePhotoFinder()

    [result] = await ensure_photos([card], finder, city=CITY)

    assert result == card
    assert finder.lookups == []


async def test_a_card_without_an_image_is_looked_up_by_title_coordinates_and_city():
    card = _card(id="a", title="Náncsi néni", lat=BUDAPEST[0], lon=BUDAPEST[1])
    photo = Photo(url="https://example.com/photo.jpg", credit="Someone · Wikimedia")
    finder = FakePhotoFinder({"Náncsi néni": photo})

    [result] = await ensure_photos([card], finder, city="Bologna")

    assert finder.lookups == [("Náncsi néni", BUDAPEST[0], BUDAPEST[1])]
    assert finder.cities == ["Bologna"]
    assert result.image_url == photo.url
    assert result.image_credit == photo.credit
    # Nothing else about the card changed.
    assert result.model_copy(update={"image_url": None, "image_credit": None}) == card


async def test_the_callers_fallback_is_asked_when_the_finder_answers_none() -> None:
    card = _card(id="a", category="eat", lat=BUDAPEST[0], lon=BUDAPEST[1])
    finder = FakePhotoFinder()  # knows nothing

    [result] = await ensure_photos([card], finder, city=CITY, fallback=_corpus_eat)

    assert result.image_url == "https://c/goulash.jpg"
    assert result.image_credit == "Kispiac · Wikivoyage"


async def test_the_fallback_is_asked_when_the_card_has_no_coordinates() -> None:
    card = _card(id="a", category="eat", lat=None, lon=None, source_url="")
    finder = FakePhotoFinder({"Card": Photo(url="unused", credit="unused")})

    [result] = await ensure_photos([card], finder, city=CITY, fallback=_corpus_eat)

    assert finder.lookups == []
    assert result.image_url == "https://c/goulash.jpg"


async def test_the_neutral_placeholder_is_the_last_resort() -> None:
    card = _card(id="a", category="drink", lat=BUDAPEST[0], lon=BUDAPEST[1])

    [result] = await ensure_photos(
        [card], FakePhotoFinder(), city=CITY, fallback=_corpus_eat
    )

    assert result.image_url == LAST_RESORT.url
    assert result.image_credit is not None
    assert result.image_credit.startswith(ILLUSTRATIVE)


async def test_without_the_last_resort_the_card_stays_unpictured() -> None:
    card = _card(id="a", lat=BUDAPEST[0], lon=BUDAPEST[1])

    [result] = await ensure_photos(
        [card], FakePhotoFinder(), city=CITY, last_resort=False
    )

    assert result == card


async def test_input_order_is_preserved() -> None:
    cards = [
        _card(id="a", lat=BUDAPEST[0], lon=BUDAPEST[1]),
        _card(id="b", image_url="https://example.com/b.jpg", image_credit="B"),
        _card(id="c", lat=BUDAPEST[0], lon=BUDAPEST[1]),
    ]

    results = await ensure_photos(cards, FakePhotoFinder(), city=CITY)

    assert [c.id for c in results] == ["a", "b", "c"]


async def test_works_without_a_finder() -> None:
    card = _card(id="a", category="sleep", lat=BUDAPEST[0], lon=BUDAPEST[1])

    [result] = await ensure_photos([card], None, city=CITY)

    assert result.image_url == LAST_RESORT.url


async def test_no_cards_is_a_no_op() -> None:
    assert await ensure_photos([], FakePhotoFinder(), city=CITY) == []


async def test_never_runs_more_than_lookups_in_flight_concurrent_lookups() -> None:
    class ConcurrencyTrackingFinder:
        def __init__(self) -> None:
            self.current = 0
            self.max_seen = 0
            self._lock = asyncio.Lock()

        async def find_for_page(self, page_url: str) -> Photo | None:
            return None

        async def find(
            self, name: str, lat: float, lon: float, *, city: str
        ) -> Photo | None:
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

    await ensure_photos(cards, finder, city=CITY, last_resort=False)

    assert finder.max_seen == LOOKUPS_IN_FLIGHT


def test_the_placeholder_is_neutral_and_credited_as_illustrative() -> None:
    # No city, no venue: a gradient the page can always render.
    assert LAST_RESORT.url.startswith("data:image/svg+xml,")
    assert LAST_RESORT.credit.startswith(ILLUSTRATIVE)


# ─── Pages without coordinates (TRA-163) ─────────────────────────────────────


async def test_a_card_without_coordinates_is_pictured_by_its_page():
    page = "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros"
    finder = FakePhotoFinder(
        pages={page: Photo("https://c/belvaros.jpg", "A (CC0) · Wikimedia Commons")}
    )
    card = _card(
        id="nb-1",
        title="Belváros",
        lat=None,
        lon=None,
        source_url=page,
        category="neighbourhood",
    )

    [pictured] = await ensure_photos([card], finder, city=CITY)

    assert pictured.image_url == "https://c/belvaros.jpg"
    assert finder.page_lookups == [page] and finder.lookups == []


async def test_a_page_without_an_image_falls_back_when_asked():
    page = "https://en.wikivoyage.org/wiki/Budapest/North_Buda"
    card = _card(
        id="nb-2",
        title="North Buda",
        lat=None,
        lon=None,
        source_url=page,
        category="neighbourhood",
    )

    [kept] = await ensure_photos(
        [card], FakePhotoFinder(), city=CITY, last_resort=False
    )
    [illustrated] = await ensure_photos([card], FakePhotoFinder(), city=CITY)

    assert kept.image_url is None
    assert illustrated.image_url == LAST_RESORT.url
