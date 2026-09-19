"""Use case: one planner card in full, read back from the corpus (TRA-178).

The page holds card ids, not cards — so when the traveller opens an activity
it asks for the id and the store answers. Nothing the client sends is shown:
an id that is not in the index is `EntityNotFound`, which is also what an id
someone made up gets.
"""

import logging

from travel_common.exceptions import EntityNotFound

from ai_api.application.cards import detail_from_document
from ai_api.domain.ports import Retriever
from ai_api.schemas.planner import CardDetail

logger = logging.getLogger(__name__)


class CardDetailLookup:
    """Hydrates the detail of the card a corpus document id names."""

    def __init__(self, retriever: Retriever) -> None:
        self._retriever = retriever

    async def __call__(self, card_id: str) -> CardDetail:
        documents = await self._retriever.fetch([card_id])
        for document in documents:
            if document.id == card_id:
                return detail_from_document(document)
        logger.info("No corpus document for card id %r", card_id)
        raise EntityNotFound("Card", card_id)
