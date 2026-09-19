"""Every card gets a picture (TRA-161, TRA-168).

The corpus has photos for most sights but for few restaurants, bars or
hotels. A card without one is looked up on Wikimedia Commons by name and at
the venue's coordinates; when that finds nothing, the caller's fallback (a
pictured place of the same city and category, from the corpus) is asked;
and when the corpus has no such picture either, a neutral placeholder is
shown and credited as such, so no card is ever blank and no card ever
shows another city.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from urllib.parse import quote

from ai_api.domain.models import Photo
from ai_api.domain.ports import PhotoFinder
from ai_api.schemas.planner_events import OptionCard

logger = logging.getLogger(__name__)

LOOKUPS_IN_FLIGHT = 6
"""Commons lookups at a time for one turn: polite, and well under a second."""

ILLUSTRATIVE = "Illustrative photo"
"""Credit prefix of a picture that is not of the place itself."""

PhotoFallback = Callable[[OptionCard], Awaitable[Photo | None]]
"""What pictures a card when neither it nor Commons has a photo of it."""

_PLACEHOLDER_SVG = (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'>"
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
    "<stop offset='0' stop-color='#4f6ef7'/><stop offset='1' stop-color='#1c2540'/>"
    "</linearGradient></defs><rect width='800' height='500' fill='url(#g)'/>"
    "<circle cx='620' cy='140' r='48' fill='#ffffff' fill-opacity='0.25'/>"
    "<path d='M0 380 L180 250 L320 340 L470 210 L640 330 L800 260 L800 500 L0 500 Z'"
    " fill='#ffffff' fill-opacity='0.18'/></svg>"
)

LAST_RESORT = Photo(
    url="data:image/svg+xml," + quote(_PLACEHOLDER_SVG),
    credit=f"{ILLUSTRATIVE} · placeholder",
)
"""A neutral picture for a corpus with no photo of that category at all."""


async def ensure_photos(
    cards: Sequence[OptionCard],
    finder: PhotoFinder | None,
    *,
    city: str,
    fallback: PhotoFallback | None = None,
    last_resort: bool = True,
) -> list[OptionCard]:
    """The same cards, each with a picture: its own, one found on Commons
    (by name in `city`, or near its coordinates, or its page's lead image),
    the caller's `fallback`, and finally the neutral placeholder (when
    `last_resort`)."""
    if not cards:
        return []
    gate = asyncio.Semaphore(LOOKUPS_IN_FLIGHT)

    async def with_photo(card: OptionCard) -> OptionCard:
        if card.image_url:
            return card
        photo: Photo | None = None
        if finder is not None:
            async with gate:
                if card.lat is not None and card.lon is not None:
                    photo = await finder.find(card.title, card.lat, card.lon, city=city)
                elif card.source_url:
                    # A district or an article: pictured by its page's lead image.
                    photo = await finder.find_for_page(card.source_url)
        if photo is None and fallback is not None:
            photo = await fallback(card)
        if photo is None and last_resort:
            photo = LAST_RESORT
        if photo is None:
            return card
        return card.model_copy(
            update={"image_url": photo.url, "image_credit": photo.credit}
        )

    return list(await asyncio.gather(*(with_photo(card) for card in cards)))
