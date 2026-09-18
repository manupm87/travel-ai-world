"""The planner's request: one turn of the conversation (TRA-142).

`ai_api` keeps no state between requests, so the client sends what the
planner has to know each time: the transcript, the brief and the itinerary it
holds (card ids only; the cards themselves live in the corpus). Limits follow
`schemas/chat.py`. Like the events, nothing here has a default: the page sends
every field (`null` when unknown), and the generated type says so.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from ai_api.schemas.chat import MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS, ChatMessage
from ai_api.schemas.planner_events import Slot, TripBrief

MAX_CARD_IDS = 20
"""Most ids a selection or a slot may carry."""

MAX_DAYS = 14
"""Longest itinerary a snapshot may describe."""


class SelectAction(BaseModel):
    """Cards chosen in a carousel the server sent earlier (`group_id`)."""

    type: Literal["select"]
    group_id: str = Field(min_length=1, max_length=120)
    card_ids: list[str] = Field(min_length=1, max_length=MAX_CARD_IDS)


class RemoveAction(BaseModel):
    """An activity taken out of a slot."""

    type: Literal["remove"]
    slot: Slot
    card_id: str = Field(min_length=1)


PlannerAction = Annotated[SelectAction | RemoveAction, Field(discriminator="type")]


class DaySlots(BaseModel):
    """Card ids per part of the day. Every part is sent, empty or not, so the
    generated type matches the page's `Record<DayPart, string[]>`."""

    morning: list[str] = Field(max_length=MAX_CARD_IDS)
    afternoon: list[str] = Field(max_length=MAX_CARD_IDS)
    evening: list[str] = Field(max_length=MAX_CARD_IDS)
    night: list[str] = Field(max_length=MAX_CARD_IDS)


class DaySnapshot(BaseModel):
    day: int = Field(ge=1)
    slots: DaySlots


class ItinerarySnapshot(BaseModel):
    """What the client holds: the stay and the days, as card ids."""

    stay_card_id: str | None
    days: list[DaySnapshot] = Field(max_length=MAX_DAYS)


class PlannerTurn(BaseModel):
    """One turn: a message, a structured action, or both."""

    message: str | None = Field(max_length=MAX_MESSAGE_CHARS)
    action: PlannerAction | None
    history: list[ChatMessage] = Field(
        max_length=MAX_HISTORY_TURNS,
        description="Text turns before this one, oldest first",
    )
    brief: TripBrief | None
    itinerary: ItinerarySnapshot | None
    trip_id: UUID | None = Field(
        description="Reserved: the Trip this draft will be saved to"
    )
