"""Every card gets a picture (TRA-161).

The corpus has photos for most sights but for almost no restaurant, bar or
hotel. A card without one is looked up on Wikimedia Commons at the venue's
coordinates; when that finds nothing, an illustrative photo of the category
in Budapest is shown and credited as such, so no card is ever blank.
"""

import asyncio
import logging
from collections.abc import Sequence

from ai_api.domain.models import Photo
from ai_api.domain.ports import PhotoFinder
from ai_api.schemas.planner_events import OptionCard

logger = logging.getLogger(__name__)

LOOKUPS_IN_FLIGHT = 6
"""Commons lookups at a time for one turn: polite, and well under a second."""

ILLUSTRATIVE = "Illustrative photo"


def _commons(file: str, author: str, licence: str, width: int = 800) -> Photo:
    from urllib.parse import quote

    return Photo(
        url=f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(file)}?width={width}",
        credit=f"{ILLUSTRATIVE} · {author} ({licence}) · Wikimedia Commons",
    )


# Licence-clean Budapest photos per category, from the recorded demo session
# (credits as Commons lists them). Used only when neither the corpus nor a
# Commons lookup has a picture of the place itself.
FALLBACK_PHOTOS: dict[str, Photo] = {
    "eat": _commons("Goulash hungarian.jpg", "RitaE", "CC0"),
    "drink": _commons("Szimpla Kert Trabant.jpg", "JoshuaCrawford", "CC BY-SA 4.0"),
    "sleep": _commons("Vörösmarty tér -.jpg", "Elekes Andor", "CC BY-SA 4.0"),
    "do": _commons(
        "Budapest Széchenyi Baths R02.jpg", "Marc Ryckaert (MJJR)", "CC BY 3.0"
    ),
    "tour": _commons("Kazinczy utca, Budapest.jpg", "tomasz przechlewski", "CC BY 2.0"),
    "see": _commons(
        "Széchenyi Chain Bridge in Budapest at night.jpg", "Wilfredor", "CC0"
    ),
    "history": _commons("Budavári Palota, ABCDEF épület.jpg", "Varius", "CC BY-SA 3.0"),
    "neighbourhood": _commons("Vörösmarty tér -.jpg", "Elekes Andor", "CC BY-SA 4.0"),
}
DEFAULT_FALLBACK = FALLBACK_PHOTOS["see"]


def fallback_photo(category: str) -> Photo:
    return FALLBACK_PHOTOS.get(category, DEFAULT_FALLBACK)


async def ensure_photos(
    cards: Sequence[OptionCard],
    finder: PhotoFinder | None,
    *,
    fallback: bool = True,
) -> list[OptionCard]:
    """The same cards, each with a picture: its own, one found near it, or an
    illustrative one for its category (when `fallback`)."""
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
                    photo = await finder.find(card.title, card.lat, card.lon)
                elif card.source_url:
                    # A district or an article: pictured by its page's lead image.
                    photo = await finder.find_for_page(card.source_url)
        if photo is None and fallback:
            photo = fallback_photo(card.category)
        if photo is None:
            return card
        return card.model_copy(
            update={"image_url": photo.url, "image_credit": photo.credit}
        )

    return list(await asyncio.gather(*(with_photo(card) for card in cards)))
