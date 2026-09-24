"""The planner's stream, one typed event per `data:` line (SSE v2, TRA-142).

Every model here is what the browser receives, so nothing is optional on the
wire: a field the server may not know travels as `null`, never missing. That
is why no field has a default (the generated TypeScript would make it
optional otherwise) and why `type` and `op`, the discriminators, are always
written out. `PlannerTurn`, the request, lives in `schemas/planner.py`.

These models are not referenced by any route (the response is a stream), so
`ai_api.openapi` registers them in the OpenAPI document explicitly.
"""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field

BriefField = Literal["destination", "origin", "travellers", "dates", "interests"]
"""The checklist: what a brief must have before a trip is generated."""

BRIEF_FIELDS: tuple[BriefField, ...] = (
    "destination",
    "origin",
    "dates",
    "travellers",
    "interests",
)

PriceTier = Literal[1, 2, 3]
"""`€`, `€€`, `€€€`: the only way a price is ever shown, never a number."""

Pace = Literal["relaxed", "balanced", "intense"]
DayPart = Literal["morning", "afternoon", "evening", "night"]
DAY_PARTS: tuple[DayPart, ...] = ("morning", "afternoon", "evening", "night")

OptionKind = Literal[
    "neighbourhood", "hotel", "experience", "restaurant", "flight", "day_template"
]
SelectionMode = Literal["single", "multi"]
WarnCode = Literal["too_far", "closed", "overloaded_day", "unverified_price"]

PackingStep = Literal["open", "list", "wardrobe", "fold", "weigh", "zip"]
"""What the turn is doing, told as packing a suitcase (TRA-242, ADR 0025): the
trace's five phases (ADR 0024) plus `list`, the brief being written down."""

PACKING_STEPS: tuple[PackingStep, ...] = (
    "open",
    "list",
    "wardrobe",
    "fold",
    "weigh",
    "zip",
)

MAX_WHY_CHARS = 140
"""The one model-written field of a card is kept short."""


class TripBrief(BaseModel):
    """What the planner knows about the trip; the client sends it back each turn."""

    destination: str | None
    origin: str | None
    start_date: date | None
    end_date: date | None
    nights: int | None
    adults: int | None
    children: int | None
    budget_tier: PriceTier | None
    interests: list[str]
    pace: Pace | None

    @classmethod
    def empty(cls) -> "TripBrief":
        return cls(
            destination=None,
            origin=None,
            start_date=None,
            end_date=None,
            nights=None,
            adults=None,
            children=None,
            budget_tier=None,
            interests=[],
            pace=None,
        )

    def missing(self) -> list[BriefField]:
        """Checklist fields still unknown, in checklist order."""
        known: dict[BriefField, bool] = {
            "destination": bool(self.destination),
            "origin": bool(self.origin),
            "dates": self.start_date is not None and self.end_date is not None,
            "travellers": self.adults is not None and self.adults > 0,
            "interests": len(self.interests) > 0,
        }
        return [field for field in BRIEF_FIELDS if not known[field]]


class Slot(BaseModel):
    """A part of a day; `part` is null when the server did not pin one."""

    day: int = Field(ge=1)
    part: DayPart | None


class OptionCard(BaseModel):
    """One selectable card, hydrated from the corpus document `id` names.

    Everything but `why` comes from the document's metadata; the model only
    picks ids and explains its pick.
    """

    id: str
    title: str
    subtitle: str | None
    district: str | None
    category: str
    image_url: str | None
    image_credit: str | None
    price_tier: PriceTier | None
    rating_text: str | None
    hours: str | None
    lat: float | None
    lon: float | None
    why: str = Field(max_length=MAX_WHY_CHARS)
    source: str
    source_url: str
    license: str
    deep_link: str | None


# ─── Itinerary ops (discriminated on `op`) ───────────────────────────────────


class SetStayOp(BaseModel):
    op: Literal["set_stay"]
    card: OptionCard


class PutActivityOp(BaseModel):
    op: Literal["put_activity"]
    slot: Slot
    card: OptionCard


class RemoveActivityOp(BaseModel):
    op: Literal["remove_activity"]
    slot: Slot
    card_id: str


class SetDayTitleOp(BaseModel):
    op: Literal["set_day_title"]
    day: int = Field(ge=1)
    title: str


class SetRouteOp(BaseModel):
    """The journey there and back: a prefilled search, never a price."""

    op: Literal["set_route"]
    origin: str
    destination: str
    outbound_date: date | None
    return_date: date | None
    deep_link: str | None


class SetWeatherOp(BaseModel):
    op: Literal["set_weather"]
    day: int = Field(ge=1)
    summary: str
    t_max: float | None
    t_min: float | None
    source: str


class WarnOp(BaseModel):
    op: Literal["warn"]
    slot: Slot | None
    code: WarnCode
    message: str


ItineraryOp = Annotated[
    SetStayOp
    | PutActivityOp
    | RemoveActivityOp
    | SetDayTitleOp
    | SetRouteOp
    | SetWeatherOp
    | WarnOp,
    Field(discriminator="op"),
]


# ─── Events (discriminated on `type`) ────────────────────────────────────────


class TextEvent(BaseModel):
    type: Literal["text"]
    delta: str


class BriefEvent(BaseModel):
    type: Literal["brief"]
    brief: TripBrief
    missing: list[BriefField]


class OptionsEvent(BaseModel):
    """A carousel the user can pick from; `group_id` names it in the next turn."""

    type: Literal["options"]
    group_id: str
    kind: OptionKind
    prompt: str
    slot: Slot | None
    selection: SelectionMode
    cards: list[OptionCard]


class ItineraryPatchEvent(BaseModel):
    type: Literal["itinerary_patch"]
    ops: list[ItineraryOp]


class ErrorEvent(BaseModel):
    type: Literal["error"]
    error: str
    error_code: str


class DoneEvent(BaseModel):
    type: Literal["done"]


class ProgressEvent(BaseModel):
    """The step the turn has reached, sent as it starts (TRA-242, ADR 0025).

    Steps only move forward; the same step may come again when `sources`
    grows. `detail` is one sentence in the traveller's language; `sources`
    are the corpora the turn has drawn on so far ("Wikivoyage", "Open-Meteo").
    """

    type: Literal["progress"]
    step: PackingStep
    detail: str
    sources: list[str]


PlannerEvent = Annotated[
    TextEvent
    | BriefEvent
    | OptionsEvent
    | ItineraryPatchEvent
    | ErrorEvent
    | DoneEvent
    | ProgressEvent,
    Field(discriminator="type"),
]

EVENT_MODELS: tuple[type[BaseModel], ...] = (
    TextEvent,
    BriefEvent,
    OptionsEvent,
    ItineraryPatchEvent,
    ErrorEvent,
    DoneEvent,
    ProgressEvent,
)


# ─── Constructors: the discriminator written once, here ──────────────────────


def text(delta: str) -> TextEvent:
    return TextEvent(type="text", delta=delta)


def brief_event(brief: TripBrief) -> BriefEvent:
    return BriefEvent(type="brief", brief=brief, missing=brief.missing())


def options(
    group_id: str,
    kind: OptionKind,
    prompt: str,
    cards: list[OptionCard],
    *,
    slot: Slot | None = None,
    selection: SelectionMode = "single",
) -> OptionsEvent:
    return OptionsEvent(
        type="options",
        group_id=group_id,
        kind=kind,
        prompt=prompt,
        slot=slot,
        selection=selection,
        cards=cards,
    )


def patch(*ops: ItineraryOp) -> ItineraryPatchEvent:
    return ItineraryPatchEvent(type="itinerary_patch", ops=list(ops))


def error_event(error: str, error_code: str) -> ErrorEvent:
    return ErrorEvent(type="error", error=error, error_code=error_code)


def done() -> DoneEvent:
    return DoneEvent(type="done")


def progress(step: PackingStep, detail: str, sources: list[str]) -> ProgressEvent:
    return ProgressEvent(
        type="progress", step=step, detail=detail, sources=list(sources)
    )


def set_stay(card: OptionCard) -> SetStayOp:
    return SetStayOp(op="set_stay", card=card)


def put_activity(slot: Slot, card: OptionCard) -> PutActivityOp:
    return PutActivityOp(op="put_activity", slot=slot, card=card)


def remove_activity(slot: Slot, card_id: str) -> RemoveActivityOp:
    return RemoveActivityOp(op="remove_activity", slot=slot, card_id=card_id)


def set_day_title(day: int, title: str) -> SetDayTitleOp:
    return SetDayTitleOp(op="set_day_title", day=day, title=title)


def set_route(
    origin: str,
    destination: str,
    *,
    outbound_date: date | None,
    return_date: date | None,
    deep_link: str | None,
) -> SetRouteOp:
    return SetRouteOp(
        op="set_route",
        origin=origin,
        destination=destination,
        outbound_date=outbound_date,
        return_date=return_date,
        deep_link=deep_link,
    )


def set_weather(
    day: int, summary: str, *, t_max: float | None, t_min: float | None, source: str
) -> SetWeatherOp:
    return SetWeatherOp(
        op="set_weather",
        day=day,
        summary=summary,
        t_max=t_max,
        t_min=t_min,
        source=source,
    )


def warn(code: WarnCode, message: str, *, slot: Slot | None = None) -> WarnOp:
    return WarnOp(op="warn", slot=slot, code=code, message=message)
