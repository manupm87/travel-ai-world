"""Use case: one planner card in full, read back from the corpus (TRA-178).

The page holds card ids, not cards — so when the traveller opens an activity
it asks for the id and the store answers. Nothing the client sends is shown:
an id that is not in the index is `EntityNotFound`, which is also what an id
someone made up gets.

The detail is pictured like the carousel is (TRA-161, TRA-206): the corpus
has no photo of most restaurants, bars, hotels or tours, so the card goes
through `ensure_photos` — Wikimedia Commons, then the preview the venue's own
site publishes — before the article is added to it. Without a find the photo
stays `None` — never the placeholder, which would paint over the better
picture the client's own card may carry.
"""

import logging
from collections.abc import Sequence
from urllib.parse import urlparse

from travel_common.exceptions import EntityNotFound

from ai_api.application.cards import card_from_document, detail_from_card
from ai_api.application.photos import PhotoTally, ensure_photos
from ai_api.application.plan_trip import resolve_city
from ai_api.application.tracing import current_tracer
from ai_api.domain.models import City, Document
from ai_api.domain.ports import PhotoFinder, Retriever, SitePreviewFinder
from ai_api.schemas.planner import CardDetail

logger = logging.getLogger(__name__)


class CardDetailLookup:
    """Hydrates the detail of the card a corpus document id names."""

    def __init__(
        self,
        retriever: Retriever,
        *,
        photos: PhotoFinder | None = None,
        previews: SitePreviewFinder | None = None,
        cities: Sequence[City] = (),
    ) -> None:
        self._retriever = retriever
        self._photos = photos
        self._previews = previews
        self._cities = cities

    async def __call__(self, card_id: str) -> CardDetail:
        tracer = current_tracer()
        tracer.phase("open")
        async with tracer.span(
            "retriever", "fetch:card", purpose="fetch", query=card_id, k=1
        ) as span:
            documents = await self._retriever.fetch([card_id])
            tracer.retrieved(span, documents)
        for document in documents:
            if document.id == card_id:
                tracer.mark_used([card_id])
                slug = document.metadata.get("city")
                tracer.city = slug if isinstance(slug, str) else None
                return await self._detail(document)
        logger.info("No corpus document for card id %r", card_id)
        raise EntityNotFound("Card", card_id)

    async def _detail(self, document: Document) -> CardDetail:
        tracer = current_tracer()
        tracer.phase("weigh")
        card = card_from_document(document)
        tally = PhotoTally()
        async with tracer.span("chain", "photos") as span:
            [pictured] = await ensure_photos(
                [card],
                tally.finder(self._photos),
                city=self._city_name(document),
                previews=tally.previews(self._previews),
                last_resort=False,
            )
            span.payload["details"] = tally.sources([card], [pictured])
        if self._previews is not None and card.deep_link and not card.image_url:
            # The venue's own site was asked only when Commons had nothing.
            with tracer.sync_span(
                "tool",
                "site_preview",
                service="site-preview",
                host=urlparse(card.deep_link).netloc or None,
                status="ok" if tally.site else "empty",
                count=tally.site,
            ):
                pass
        return detail_from_card(pictured, document)

    def _city_name(self, document: Document) -> str:
        """What a Commons search calls the document's city: its display name
        when the manifest knows the slug, else the slug itself."""
        slug = document.metadata.get("city")
        if not isinstance(slug, str):
            return ""
        city = resolve_city(slug, self._cities)
        return city.name if city is not None else slug
