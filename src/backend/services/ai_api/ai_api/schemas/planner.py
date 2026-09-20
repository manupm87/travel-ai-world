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

from ai_api.domain.models import City
from ai_api.schemas.chat import MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS, ChatMessage
from ai_api.schemas.planner_events import OptionCard, Slot, TripBrief

MAX_CARD_IDS = 20
"""Most ids a selection or a slot may carry."""

MAX_CARD_ID_CHARS = 200
"""A corpus id is a short key (`osm:relation/13067`), never a payload."""

MAX_EXCLUDED_CARD_IDS = 60
"""Most ids one ask may rule out: `OPTIONS_COUNT` a page, a few pages deep."""

MAX_DAYS = 14
"""Longest itinerary a snapshot may describe."""


CardId = Annotated[str, Field(min_length=1, max_length=MAX_CARD_ID_CHARS)]
"""One corpus document id, as a request carries it."""


class SelectAction(BaseModel):
    """Cards chosen in a carousel the server sent earlier (`group_id`).

    A group whose id names a slot (`slot:<day>:<part>`) places the pick on
    its own. A `found:` group does not: its cards arrived unplaced, so the
    page names the day and the part the traveller chose in `slot` (TRA-185,
    ADR 0018). `null` for every placed group.
    """

    type: Literal["select"]
    group_id: str = Field(min_length=1, max_length=120)
    card_ids: list[str] = Field(min_length=1, max_length=MAX_CARD_IDS)
    slot: Slot | None


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
    exclude_card_ids: list[CardId] = Field(
        max_length=MAX_EXCLUDED_CARD_IDS,
        description="ids the traveller already saw for this ask; never offered again",
    )
    trip_id: UUID | None = Field(
        description="Reserved: the Trip this draft will be saved to"
    )


class CardDetail(OptionCard):
    """One card in full (`GET /planner/card?id=`): what the panel shows when a
    traveller opens an activity, on top of everything the carousel card has.

    Additive over `OptionCard` and read from the same place — the corpus
    document the id names — so the client never sends content, only an id.
    Like every planner model, no field has a default: an unknown one travels
    as `null` and the generated TypeScript keeps it required.
    """

    description: str = Field(
        description=(
            "The corpus document's own text, trimmed at a sentence boundary; "
            "empty when the document carries none"
        )
    )
    address: str | None
    phone: str | None
    website: str | None = Field(
        description="The venue's own site, when it is not the source page"
    )
    heading_path: str | None = Field(
        description="Where the document sits in the city's corpus"
    )


class CityIntro(BaseModel):
    """A city's own description in one language: the lead of its Wikivoyage
    article (CC BY-SA 4.0), trimmed at a sentence boundary, and the page it
    comes from — shown with the text, as the licence asks."""

    text: str
    source_url: str


class PlannerCity(BaseModel):
    """A city the planner covers (`GET /planner/cities`): what the page needs
    to offer it as a destination and to introduce it on a trip overview. The
    spellings it answers to stay server-side."""

    slug: str
    name: str
    centre: tuple[float, float] = Field(description="[latitude, longitude]")
    timezone: str
    intro: dict[str, CityIntro] = Field(
        description=(
            "The city's description keyed by language code (`en`, `es`); a "
            "language the corpus has no lead for is absent"
        )
    )
    image_url: str | None = Field(
        description="The city's photo on Wikimedia Commons, 1200 px wide"
    )
    image_credit: str | None = Field(
        description="The line to print beside the photo (author and licence)"
    )


def planner_city(city: City) -> PlannerCity:
    return PlannerCity(
        slug=city.slug,
        name=city.name,
        centre=city.centre,
        timezone=city.timezone,
        intro={
            lang: CityIntro(text=intro.text, source_url=intro.source_url)
            for lang, intro in city.intro.items()
        },
        image_url=city.image_url,
        image_credit=city.image_credit,
    )
