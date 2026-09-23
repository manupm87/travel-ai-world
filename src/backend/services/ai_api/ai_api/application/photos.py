"""Every card gets a picture (TRA-161, TRA-168, TRA-206).

The corpus has photos for most sights but for few restaurants, bars or
hotels. A card without one is looked up on Wikimedia Commons by name and at
the venue's coordinates; when that finds nothing and the card links to the
venue's own site, the image that site publishes as its link preview is used
(ADR 0021); when neither answers, the caller's fallback is asked (only a
neighbourhood borrows a sight of its district — no card ever shows the photo
of a different venue); and when that finds nothing either, a neutral
placeholder is shown and credited as such, so no card is ever blank.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from urllib.parse import quote

from ai_api.domain.models import Photo
from ai_api.domain.ports import PhotoFinder, SitePreviewFinder
from ai_api.schemas.planner_events import OptionCard

logger = logging.getLogger(__name__)

LOOKUPS_IN_FLIGHT = 6
"""Lookups at a time for one turn: polite, and well under a second."""

ILLUSTRATIVE = "Illustrative photo"
"""Credit prefix of a picture that is not of the place itself."""

PhotoFallback = Callable[[OptionCard], Awaitable[Photo | None]]
"""What pictures a card when neither it, nor Commons, nor its own site has a
photo of it."""

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
    previews: SitePreviewFinder | None = None,
    fallback: PhotoFallback | None = None,
    last_resort: bool = True,
) -> list[OptionCard]:
    """The same cards, each with a picture: its own, one found on Commons
    (by name in `city`, or near its coordinates, or its page's lead image),
    the preview its own site publishes (`deep_link`), the caller's
    `fallback`, and finally the neutral placeholder (when `last_resort`)."""
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
        if photo is None and previews is not None and card.deep_link:
            # The venue's own site: what a link to it previews as (ADR 0021).
            async with gate:
                photo = await previews.preview(card.deep_link)
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


# ─── Where the pictures came from (the trace's `photos` step, ADR 0024) ─────


@dataclass(slots=True)
class PhotoTally:
    """Counts the photos Commons and the venues' own sites answered while it
    wraps the two lookups; `sources` then tells every card's origin."""

    commons: int = 0
    site: int = 0
    site_asked: int = 0
    """How many times a venue's own site was asked, answered or not."""

    def finder(self, finder: PhotoFinder | None) -> PhotoFinder | None:
        return None if finder is None else _CountingFinder(finder, self)

    def previews(self, previews: SitePreviewFinder | None) -> SitePreviewFinder | None:
        return None if previews is None else _CountingPreviews(previews, self)

    def sources(
        self, before: Sequence[OptionCard], after: Sequence[OptionCard]
    ) -> dict[str, int]:
        """`corpus` (pictured already), `commons`, `site`, `placeholder`, and
        `district` (a neighbourhood's borrowed sight) for the rest."""
        corpus = sum(1 for card in before if card.image_url)
        placeholder = sum(
            1 for card in after if card.image_credit == LAST_RESORT.credit
        )
        pictured = sum(1 for card in after if card.image_url)
        district = pictured - corpus - self.commons - self.site - placeholder
        return {
            "corpus": corpus,
            "commons": self.commons,
            "site": self.site,
            "district": max(0, district),
            "placeholder": placeholder,
        }


class _CountingFinder:
    def __init__(self, wrapped: PhotoFinder, tally: PhotoTally) -> None:
        self._wrapped = wrapped
        self._tally = tally

    async def find(
        self, name: str, lat: float, lon: float, *, city: str
    ) -> Photo | None:
        return self._count(await self._wrapped.find(name, lat, lon, city=city))

    async def find_for_page(self, page_url: str) -> Photo | None:
        return self._count(await self._wrapped.find_for_page(page_url))

    def _count(self, photo: Photo | None) -> Photo | None:
        if photo is not None:
            self._tally.commons += 1
        return photo


class _CountingPreviews:
    def __init__(self, wrapped: SitePreviewFinder, tally: PhotoTally) -> None:
        self._wrapped = wrapped
        self._tally = tally

    async def preview(self, site_url: str) -> Photo | None:
        self._tally.site_asked += 1
        photo = await self._wrapped.preview(site_url)
        if photo is not None:
            self._tally.site += 1
        return photo
