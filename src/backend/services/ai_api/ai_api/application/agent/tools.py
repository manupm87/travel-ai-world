"""The tools Kiri edits a drafted trip with (ADR 0032, TRA-290).

Each tool is a name, an English description that says when to use it, a
Pydantic `Input` (its JSON Schema is what the model is shown, through
`schema.tool_schema`) and an async `run(ctx, args)` that answers a
`ToolOutcome`: a compact JSON result for the model and the planner events
for the page. The tools call the `PlanTrip` helpers through the context —
retrieval, cards, photos, the draft of a day — and never duplicate them.

**Write tools accept only ids the turn knows** (`AgentContext.known`: the
itinerary's documents, fetched once, and whatever a tool retrieved or fetched
in this turn), and only places that are not a stay. Any other id is an error
result, so a place reaches the traveller only as a corpus document the server
fetched (ADR 0015). Edits reuse the existing ops: no wire contract change.
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Literal, Protocol

from pydantic import BaseModel, Field, ValidationError
from travel_common.exceptions import DomainError

from ai_api.application.agent.schema import tool_schema
from ai_api.application.cards import (
    card_from_document,
    cards_for,
    detail_from_document,
    title_of,
)
from ai_api.application.plan_trip import (
    DRINK_CATEGORIES,
    EAT_DRINK,
    EAT_DRINK_CATEGORIES,
    PART_PLAN,
    SIGHT_CATEGORIES,
    STAY_CATEGORIES,
    SkeletonDay,
    Turn,
    _date_of,
    _new_found_group,
    _pin_candidates,
    fold,
    has_image,
    is_place,
)
from ai_api.application.tracing import tool_span
from ai_api.application.validate import Placed, strip_prices, validate_day
from ai_api.domain.agent import ToolCall, ToolResult, ToolSpec
from ai_api.domain.models import Document
from ai_api.domain.tracing import Phase
from ai_api.schemas.planner_events import (
    DAY_PARTS,
    DayPart,
    OptionKind,
    OptionsEvent,
    Pace,
    PlannerEvent,
    PutActivityOp,
    Slot,
    TextEvent,
    options,
    patch,
    put_activity,
    remove_activity,
    set_day_title,
    text,
)
from ai_api.schemas.planner_events import ItineraryOp as Op

if TYPE_CHECKING:
    from ai_api.application.plan_trip import PlanTrip

logger = logging.getLogger(__name__)

SUMMARY_CHARS = 200
"""Longest summary a place in a tool result carries."""

CONTENT_CHARS = 800
"""Longest description `get_place` returns."""

DISTRICT_SUMMARY_CHARS = 160

UNKNOWN_ID = "unknown id: call search_places first"

Days = dict[int, dict[DayPart, list[str]]]


# ─── The context and the outcome ─────────────────────────────────────────────


@dataclass(slots=True)
class AgentContext:
    """What the tools of one turn share.

    `known` is every document fetched or retrieved in this turn, the
    itinerary's included; `days` and `stay_id` are a mutable copy of the
    snapshot the write tools keep up to date, so a later call in the same
    turn sees an earlier one's edit. `touched` are the days a write tool
    changed, `validated` the ones `redraft_day` already checked and no later
    write tool changed again.
    """

    turn: Turn
    planner: "PlanTrip"
    known: dict[str, Document]
    days: Days
    stay_id: str | None
    system: list[str] = field(default_factory=list)
    messages: list[Any] = field(default_factory=list)
    touched: set[int] = field(default_factory=set)
    validated: set[int] = field(default_factory=set)
    districts: dict[str, str] | None = None
    """District name → one-line summary, read once by `list_districts`."""
    streamed_text: bool = False
    """Whether the loop already sent text this turn (set by `run_agent`)."""

    def day_of(self, doc_id: str) -> tuple[int, DayPart] | None:
        """Where the trip holds `doc_id`, or `None`."""
        for day, parts in self.days.items():
            for part, ids in parts.items():
                if doc_id in ids:
                    return day, part
        return None

    def on_trip(self) -> set[str]:
        held = {
            i for parts in self.days.values() for ids in parts.values() for i in ids
        }
        if self.stay_id:
            held.add(self.stay_id)
        return held

    def remember(self, documents: Sequence[Document]) -> None:
        for document in documents:
            self.known.setdefault(document.id, document)


@dataclass(slots=True)
class ToolOutcome:
    """A tool's answer: `result` for the model (JSON), `events` for the page."""

    result: dict[str, Any]
    events: list[PlannerEvent] = field(default_factory=list)
    is_error: bool = False
    count: int | None = None


class ToolFailed(DomainError):
    """A call the tool refuses (unknown id, wrong day): the model reads why."""

    error_code = "TOOL_FAILED"


def failure(message: str, **extra: Any) -> ToolOutcome:
    return ToolOutcome(result={"error": message, **extra}, is_error=True)


class Tool(Protocol):
    """A tool: its class attributes say what it is, `run` does it."""

    @property
    def name(self) -> str: ...

    @property
    def description(self) -> str: ...

    @property
    def Input(self) -> type[BaseModel]: ...  # noqa: N802 (a model class)

    @property
    def phase(self) -> Phase: ...

    async def run(self, ctx: AgentContext, args: Any) -> ToolOutcome: ...


# ─── Shared helpers ──────────────────────────────────────────────────────────


def place(document: Document) -> dict[str, Any]:
    """A place as every tool result shows it."""
    m = document.metadata
    tier = m.get("price_tier")
    return {
        "id": document.id,
        "title": title_of(document),
        "category": m.get("category") or None,
        "district": m.get("district") or None,
        "tier": int(tier) if isinstance(tier, int | float) else None,
        "summary": " ".join(document.content.split())[:SUMMARY_CHARS],
        "photo": has_image(document),
    }


def _check_day(ctx: AgentContext, day: int) -> None:
    if day not in ctx.days:
        raise ToolFailed(f"day {day} is not in the trip: days are 1 to {len(ctx.days)}")


def _activity(ctx: AgentContext, doc_id: str) -> Document:
    """A known place that may go on a day: never a stay, never section prose."""
    document = ctx.known.get(doc_id)
    if document is None:
        ctx.turn.tracer.note_picks([], [doc_id])
        raise ToolFailed(UNKNOWN_ID, id=doc_id)
    if not is_place(document) or document.metadata.get("category") in STAY_CATEGORIES:
        raise ToolFailed(f"{doc_id} is not an activity: a stay or a text section")
    return document


def _part_holding(
    ctx: AgentContext, day: int, doc_id: str, parts: Sequence[DayPart]
) -> DayPart | None:
    for part in parts:
        if doc_id in ctx.days[day][part]:
            return part
    return None


async def _districts(ctx: AgentContext) -> dict[str, str]:
    if ctx.districts is None:
        found = await ctx.planner._neighbourhood_candidates(ctx.turn)
        ctx.districts = {
            str(d.metadata.get("district")): " ".join(d.content.split())[
                :DISTRICT_SUMMARY_CHARS
            ]
            for d in found
        }
    return ctx.districts


async def _district_names(ctx: AgentContext, asked: Sequence[str]) -> list[str]:
    """The corpus's own names for the districts asked, accents and case aside."""
    names = await _districts(ctx)
    by_fold = {fold(name): name for name in names}
    matched: list[str] = []
    for name in asked:
        found = by_fold.get(fold(name.strip()))
        if found is None:
            raise ToolFailed(f"unknown district {name!r}", districts=sorted(names))
        if found not in matched:
            matched.append(found)
    return matched


async def _pictured(ctx: AgentContext, documents: Sequence[Document]) -> list[Any]:
    return await ctx.planner._with_photos(ctx.turn, cards_for(documents, {}))


# ─── Read tools ──────────────────────────────────────────────────────────────


class SearchPlacesInput(BaseModel):
    query: str = Field(
        min_length=1,
        max_length=200,
        description="What to look for, in English or as the traveller said it; "
        "the place's own name when they name one.",
    )
    kind: Literal["sight", "restaurant", "bar", "any"] = Field(
        default="any",
        description="sight: sights, museums, baths, activities, tours; "
        "restaurant: places to eat or drink; bar: drinks only; any: no filter.",
    )
    district: str | None = Field(
        default=None, description="A district name from list_districts."
    )
    budget_tier: int | None = Field(
        default=None, ge=1, le=3, description="Highest price tier (1-3)."
    )
    limit: int = Field(default=6, ge=1, le=8)


KIND_CATEGORIES: dict[str, tuple[str, ...]] = {
    "sight": SIGHT_CATEGORIES,
    "restaurant": EAT_DRINK_CATEGORIES,
    "bar": DRINK_CATEGORIES,
    "any": (),
}


class SearchPlaces:
    name = "search_places"
    description = (
        "Search the city's guide for places to add, offer or talk about. Use it "
        "before add_activity or offer_options, and to answer a question about a "
        "place. Places already on the trip are left out. Returns ids to pass to "
        "the other tools."
    )
    Input = SearchPlacesInput
    phase: Phase = "wardrobe"

    async def run(self, ctx: AgentContext, args: SearchPlacesInput) -> ToolOutcome:
        turn, planner = ctx.turn, ctx.planner
        districts = await _district_names(ctx, [args.district]) if args.district else []
        pinned = await planner._named_places(turn, args.query)
        found = await planner._candidates(
            turn,
            args.query,
            KIND_CATEGORIES[args.kind],
            districts,
            args.budget_tier,
            purpose="agent_search",
        )
        held = ctx.on_trip()
        # A place the query names comes first whatever its kind (TRA-186).
        results = [
            d
            for d in _pin_candidates(pinned, found)
            if d.id not in held
            and is_place(d)
            and d.metadata.get("category") not in STAY_CATEGORIES
        ][: args.limit]
        ctx.remember(results)
        return ToolOutcome(
            result={"places": [place(d) for d in results]}, count=len(results)
        )


class GetPlaceInput(BaseModel):
    id: str = Field(min_length=1, max_length=200)


class GetPlace:
    name = "get_place"
    description = (
        "The guide's full entry for one place (description, hours, address, "
        "link). Use it to answer a detailed question about a place."
    )
    Input = GetPlaceInput
    phase: Phase = "wardrobe"

    async def run(self, ctx: AgentContext, args: GetPlaceInput) -> ToolOutcome:
        document = ctx.known.get(args.id)
        if document is None:
            found = await ctx.planner._fetch(ctx.turn, [args.id], purpose="agent_get")
            if not found:
                ctx.turn.tracer.note_picks([], [args.id])
                return failure(UNKNOWN_ID, id=args.id)
            document = found[0]
            ctx.remember(found)
        detail = detail_from_document(document)
        result = {
            **place(document),
            "content": detail.description[:CONTENT_CHARS],
            "hours": detail.hours,
            "url": detail.website or detail.source_url,
            "address": detail.address,
        }
        return ToolOutcome(result=result, count=1)


class NoInput(BaseModel):
    pass


class ListDistricts:
    name = "list_districts"
    description = (
        "The city's districts with one line each. Use it to pick districts for "
        "redraft_day or a district for search_places."
    )
    Input = NoInput
    phase: Phase = "wardrobe"

    async def run(self, ctx: AgentContext, args: NoInput) -> ToolOutcome:
        names = await _districts(ctx)
        return ToolOutcome(
            result={
                "districts": [
                    {"name": name, "summary": summary}
                    for name, summary in names.items()
                ]
            },
            count=len(names),
        )


class DayInput(BaseModel):
    day: int = Field(ge=1, description="The day of the trip, from 1.")


class GetWeather:
    name = "get_weather"
    description = (
        "The weather for one day of the trip: the forecast when it is close, "
        "else the month's climate normals. Use it for any weather question."
    )
    Input = DayInput
    phase: Phase = "wardrobe"

    async def run(self, ctx: AgentContext, args: DayInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        stay = ctx.known.get(ctx.stay_id or "")
        if stay is None:
            return failure("the stay could not be read")
        weather = await ctx.planner._weather_by_day(
            ctx.turn, card_from_document(stay), len(ctx.days)
        )
        w = weather.get(args.day)
        if w is None:
            return ToolOutcome(
                result={"day": args.day, "weather": None, "note": "no data"}, count=0
            )
        return ToolOutcome(
            result={
                "day": args.day,
                "date": w.day.isoformat(),
                "summary": w.summary,
                "t_max": w.t_max,
                "t_min": w.t_min,
                "source": w.source,
            },
            count=1,
        )


def _day_warnings(ctx: AgentContext, day: int) -> list[Any]:
    placed = [
        Placed(slot=Slot(day=day, part=part), card=card_from_document(ctx.known[i]))
        for part in DAY_PARTS
        for i in ctx.days[day][part]
        if i in ctx.known
    ]
    brief = ctx.turn.brief
    return validate_day(
        day,
        placed,
        pace=brief.pace,
        on=_date_of(brief, day),
        language=ctx.turn.language,
    )


class CheckDay:
    name = "check_day"
    description = (
        "Check one day as it is now: distances between stops, too many "
        "activities for the pace, places closed that weekday. Use it after "
        "edits when the traveller cares about the day working."
    )
    Input = DayInput
    phase: Phase = "weigh"

    async def run(self, ctx: AgentContext, args: DayInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        warnings = _day_warnings(ctx, args.day)
        return ToolOutcome(
            result={
                "day": args.day,
                "warnings": [{"code": w.code, "message": w.message} for w in warnings],
            },
            count=len(warnings),
        )


# ─── Write tools ─────────────────────────────────────────────────────────────


class AddActivityInput(BaseModel):
    id: str = Field(min_length=1, max_length=200, description="An id a tool returned.")
    day: int = Field(ge=1)
    part: DayPart


class AddActivity:
    name = "add_activity"
    description = (
        "Put a place on a day and part of the day (morning, afternoon, evening "
        "for dinner, night for drinks). Only ids search_places returned. Use it "
        "when the traveller clearly asks to add or swap in a place."
    )
    Input = AddActivityInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: AddActivityInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        document = _activity(ctx, args.id)
        held = ctx.day_of(args.id)
        if held is not None:
            return failure(
                f"already on day {held[0]} ({held[1]}): move it with move_activity "
                "or add another place",
                id=args.id,
            )
        [card] = await _pictured(ctx, [document])
        slot = Slot(day=args.day, part=args.part)
        ctx.days[args.day][args.part].append(args.id)
        ctx.touched.add(args.day)
        ctx.validated.discard(args.day)
        ctx.turn.use(document)
        ctx.turn.tracer.mark_used([args.id])
        return ToolOutcome(
            result={"added": place(document), "day": args.day, "part": args.part},
            events=[patch(put_activity(slot, card))],
            count=1,
        )


class RemoveActivityInput(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    day: int = Field(ge=1)
    part: DayPart | None = Field(
        default=None, description="Where on the day; found when omitted."
    )


class RemoveActivity:
    name = "remove_activity"
    description = (
        "Take a place off a day of the itinerary. Use it when the traveller "
        "asks to remove or replace something on the trip."
    )
    Input = RemoveActivityInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: RemoveActivityInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        parts: tuple[DayPart, ...] = (args.part,) if args.part else DAY_PARTS
        part = _part_holding(ctx, args.day, args.id, parts)
        if part is None:
            return failure(f"{args.id} is not on day {args.day}", id=args.id)
        ctx.days[args.day][part].remove(args.id)
        ctx.touched.add(args.day)
        ctx.validated.discard(args.day)
        document = ctx.known.get(args.id)
        title = title_of(document) if document is not None else args.id
        return ToolOutcome(
            result={"removed": {"id": args.id, "title": title}, "day": args.day},
            events=[patch(remove_activity(Slot(day=args.day, part=part), args.id))],
            count=1,
        )


class MoveActivityInput(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    from_day: int = Field(ge=1)
    to_day: int = Field(ge=1)
    to_part: DayPart


class MoveActivity:
    """Move is remove then put, in one patch (the page applies ops in order).

    The card is hydrated again from the corpus, so the `why` the draft wrote
    is lost and the photo may differ from the one shown before.
    """

    name = "move_activity"
    description = (
        "Move a place that is already on the trip to another day or part of the day."
    )
    Input = MoveActivityInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: MoveActivityInput) -> ToolOutcome:
        _check_day(ctx, args.from_day)
        _check_day(ctx, args.to_day)
        part = _part_holding(ctx, args.from_day, args.id, DAY_PARTS)
        if part is None:
            return failure(f"{args.id} is not on day {args.from_day}", id=args.id)
        document = _activity(ctx, args.id)
        [card] = await _pictured(ctx, [document])
        ctx.days[args.from_day][part].remove(args.id)
        ctx.days[args.to_day][args.to_part].append(args.id)
        ctx.touched.update({args.from_day, args.to_day})
        ctx.validated -= {args.from_day, args.to_day}
        ctx.turn.tracer.mark_used([args.id])
        ops: list[Op] = [
            remove_activity(Slot(day=args.from_day, part=part), args.id),
            put_activity(Slot(day=args.to_day, part=args.to_part), card),
        ]
        return ToolOutcome(
            result={
                "moved": place(document),
                "to_day": args.to_day,
                "to_part": args.to_part,
            },
            events=[patch(*ops)],
            count=1,
        )


class SetDayTitleInput(BaseModel):
    day: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=60)


class SetDayTitle:
    name = "set_day_title"
    description = "Rename a day of the trip (a short title, at most 60 characters)."
    Input = SetDayTitleInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: SetDayTitleInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        title = strip_prices(args.title.strip())[0][:60]
        return ToolOutcome(
            result={"day": args.day, "title": title},
            events=[patch(set_day_title(args.day, title))],
            count=1,
        )


class RedraftDayInput(BaseModel):
    day: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=60)
    districts: list[str] = Field(
        min_length=1,
        max_length=2,
        description="One or two district names from list_districts.",
    )
    theme: str = Field(
        min_length=1,
        max_length=120,
        description="What the day is about, e.g. 'food markets and cafés'.",
    )
    pace: Pace | None = Field(
        default=None,
        description="relaxed for a lighter day, intense for a fuller one; "
        "the trip's own pace when omitted.",
    )


class RedraftDay:
    name = "redraft_day"
    description = (
        "Plan one whole day again around a theme in one or two districts: every "
        "activity of that day is replaced. Use it when the traveller asks to "
        "redo, rethink or change the whole day."
    )
    Input = RedraftDayInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: RedraftDayInput) -> ToolOutcome:
        _check_day(ctx, args.day)
        districts = await _district_names(ctx, args.districts)
        turn = ctx.turn
        title = strip_prices(args.title.strip())[0][:60]
        theme = strip_prices(args.theme.strip())[0]
        sketch = SkeletonDay(
            day=args.day, title=title, districts=districts, theme=theme
        )
        ops: list[Op] = [
            remove_activity(Slot(day=args.day, part=part), doc_id)
            for part in DAY_PARTS
            for doc_id in ctx.days[args.day][part]
        ]
        ops.append(set_day_title(args.day, title))
        chosen: list[Document] = []
        drafted = await ctx.planner._draft_day(
            turn,
            sketch,
            len(ctx.days),
            PART_PLAN[args.pace or turn.brief.pace or "balanced"],
            {},
            chosen=chosen,
        )
        ops.extend(drafted)
        ctx.remember(chosen)
        ctx.days[args.day] = {part: [] for part in DAY_PARTS}
        for op in drafted:
            if isinstance(op, PutActivityOp) and op.slot.part is not None:
                ctx.days[args.day][op.slot.part].append(op.card.id)
        ctx.touched.add(args.day)
        ctx.validated.add(args.day)
        by_id = {d.id: d for d in chosen}
        new_day = {
            part: [place(by_id[i]) for i in ids if i in by_id]
            for part, ids in ctx.days[args.day].items()
        }
        return ToolOutcome(
            result={"day": args.day, "title": title, "parts": new_day},
            events=[patch(*ops)],
            count=len(chosen),
        )


# ─── Offers ──────────────────────────────────────────────────────────────────


class OfferOptionsInput(BaseModel):
    ids: list[str] = Field(
        min_length=1, max_length=5, description="Ids search_places returned."
    )
    heading: str = Field(
        min_length=1, max_length=80, description="The carousel's heading."
    )


class OfferOptions:
    name = "offer_options"
    description = (
        "Show the traveller up to five places as cards to choose from; they "
        "place the one they like themselves. Use it when the ask leaves the "
        "choice to them (suggestions, alternatives, 'what could I do'). Name "
        "every offered place in your reply."
    )
    Input = OfferOptionsInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: OfferOptionsInput) -> ToolOutcome:
        ids = list(dict.fromkeys(args.ids))
        documents = [_activity(ctx, i) for i in ids]
        held = [i for i in ids if ctx.day_of(i) is not None]
        if held:
            return failure("already on the trip", ids=held)
        cards = await _pictured(ctx, documents)
        kind: OptionKind = (
            "restaurant"
            if all(d.metadata.get("category") in EAT_DRINK for d in documents)
            else "experience"
        )
        heading = strip_prices(args.heading.strip())[0]
        group = _new_found_group()
        ctx.turn.tracer.mark_used(ids)
        return ToolOutcome(
            result={"group": group, "offered": [card.title for card in cards]},
            events=[options(group, kind, heading, cards, slot=None)],
            count=len(cards),
        )


class OfferStaysInput(BaseModel):
    mode: Literal["cheaper", "other_hotels", "other_neighbourhood"]


class OfferStays:
    name = "offer_stays"
    description = (
        "Offer other places to stay as cards: cheaper hotels or other hotels "
        "near the current stay, or other neighbourhoods. The traveller picks; "
        "you never change the stay yourself."
    )
    Input = OfferStaysInput
    phase: Phase = "fold"

    async def run(self, ctx: AgentContext, args: OfferStaysInput) -> ToolOutcome:
        planner, turn = ctx.planner, ctx.turn
        stream = (
            planner._neighbourhood_options(turn)
            if args.mode == "other_neighbourhood"
            else planner._hotel_options(turn, None, cheaper=args.mode == "cheaper")
        )
        events: list[PlannerEvent] = []
        offered: list[str] = []
        lead = ctx.streamed_text
        async for event in stream:
            if isinstance(event, TextEvent) and lead:
                # The helper's fixed sentence after Kiri's own words.
                event = text("\n\n" + event.delta)
                lead = False
            if isinstance(event, OptionsEvent):
                offered.extend(card.title for card in event.cards)
            events.append(event)
        return ToolOutcome(
            result={"mode": args.mode, "offered": offered},
            events=events,
            count=len(offered),
        )


TOOLS: tuple[Tool, ...] = (
    SearchPlaces(),
    GetPlace(),
    ListDistricts(),
    GetWeather(),
    CheckDay(),
    AddActivity(),
    RemoveActivity(),
    MoveActivity(),
    SetDayTitle(),
    RedraftDay(),
    OfferOptions(),
    OfferStays(),
)


# ─── The toolbox ─────────────────────────────────────────────────────────────


def _validation_errors(exc: ValidationError) -> list[str]:
    return [
        f"{'.'.join(str(p) for p in error['loc']) or 'input'}: {error['msg']}"
        for error in exc.errors(include_url=False)
    ]


class Toolbox:
    """The tools of one turn over one context: specs for the model, calls
    run with their span and phase, and the turn's closing warnings."""

    def __init__(self, context: AgentContext, tools: Sequence[Tool] = TOOLS) -> None:
        self.context = context
        self._tools = {tool.name: tool for tool in tools}
        self.specs = [
            ToolSpec(
                name=tool.name,
                description=tool.description,
                input_schema=tool_schema(tool.Input),
            )
            for tool in tools
        ]

    def note_text(self) -> None:
        """The loop streamed text to the traveller."""
        self.context.streamed_text = True

    async def call(self, call: ToolCall) -> tuple[ToolResult, list[PlannerEvent]]:
        """Run one call; whatever goes wrong becomes an error result."""
        turn = self.context.turn
        tool = self._tools.get(call.name)
        async with tool_span(turn.tracer, call.name, call.arguments) as span:
            outcome = await self._run(tool, call)
            span.payload["status"] = "error" if outcome.is_error else "ok"
            span.payload["count"] = outcome.count
            if outcome.is_error:
                span.level = "warning"
                span.message = str(outcome.result.get("error"))[:200]
        content = json.dumps(outcome.result, ensure_ascii=False, default=str)
        return (
            ToolResult(call_id=call.id, content=content, is_error=outcome.is_error),
            outcome.events,
        )

    async def _run(self, tool: Tool | None, call: ToolCall) -> ToolOutcome:
        if tool is None:
            return failure(f"unknown tool {call.name!r}", tools=sorted(self._tools))
        if "_raw" in call.arguments:
            return failure("invalid arguments: not a JSON object")
        try:
            args = tool.Input.model_validate(call.arguments)
        except ValidationError as exc:
            return failure("invalid arguments", details=_validation_errors(exc))
        self.context.turn.phase(tool.phase)
        try:
            return await tool.run(self.context, args)
        except DomainError as exc:
            return failure(exc.message, **_jsonable(exc.extras))
        except Exception:
            logger.exception("Tool %s failed", call.name)
            return failure("internal")

    def finish(self) -> list[PlannerEvent]:
        """The warnings of every day a write tool changed, one patch per day,
        except the days `redraft_day` already checked."""
        ctx = self.context
        events: list[PlannerEvent] = []
        for day in sorted(ctx.touched - ctx.validated):
            with ctx.turn.tracer.sync_span("chain", "validate_day") as span:
                warnings = _day_warnings(ctx, day)
                span.payload["details"] = {
                    "day": day,
                    "warnings": [w.code for w in warnings],
                }
                if warnings:
                    span.level = "warning"
            if warnings:
                events.append(patch(*warnings))
        return events


def _jsonable(extras: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in extras.items() if isinstance(v, str | int | list | None)}
