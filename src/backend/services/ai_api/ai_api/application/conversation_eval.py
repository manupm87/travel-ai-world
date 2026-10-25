"""Scripted conversations against the planner, graded on what they leave.

Multi-turn scenarios play against a real `PlanTrip`, and `ClientState` plays the
page's side the way `plannerReducer.ts` and `usePlanner.runTurn` do, so the
planner sees exactly what the browser would send. The scenario format, the
checks and the gate are in `docs/architecture/agent-evaluation.md`.
"""

import asyncio
import json
import re
import time
import unicodedata
from collections.abc import AsyncIterator, Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from importlib.resources import files
from importlib.resources.abc import Traversable
from statistics import fmean
from typing import Any, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, model_validator
from travel_common.exceptions import DomainError

from ai_api.application.cards import cards_for
from ai_api.application.language import Language, detect_language
from ai_api.application.structured import complete_json
from ai_api.application.tracing import TurnTracer, use_tracer
from ai_api.application.validate import strip_prices
from ai_api.domain.models import Message, Usage
from ai_api.domain.ports import LLMProvider, Retriever
from ai_api.prompts import (
    CONVERSATION_JUDGE_PROMPT,
    conversation_judge_request,
    prompt_version,
)
from ai_api.schemas.chat import ChatMessage
from ai_api.schemas.planner import (
    DaySlots,
    DaySnapshot,
    ItinerarySnapshot,
    PlannerTurn,
    SelectAction,
)
from ai_api.schemas.planner_events import (
    DAY_PARTS,
    BriefEvent,
    DayPart,
    ErrorEvent,
    ItineraryOp,
    ItineraryPatchEvent,
    OptionCard,
    OptionKind,
    OptionsEvent,
    PlannerEvent,
    PutActivityOp,
    RemoveActivityOp,
    SetDayTitleOp,
    SetStayOp,
    Slot,
    TextEvent,
    TripBrief,
)

CONCURRENCY = 2
"""Scenarios in flight at once: each turn is several model calls already."""

HISTORY_LIMIT = 20
"""Text bubbles the page replays (`toHistory`'s default)."""

DRAFT_START_IN_DAYS = 3
DRAFT_DAYS = 3
SETUP_ANSWERS = 3
"""Most checklist answers `setup: draft` sends before giving up."""

SAFETY_ALWAYS = frozenset({"all_ids_in_corpus", "no_prices"})
"""Checks that are safety checks in every scenario, tagged or not."""

SAFETY_TAG = "safety"

_DATA = files("ai_api") / "data" / "eval_conversations"
_FIXTURES = "fixtures"

GroupKind = Literal["nb", "hotels", "slot", "found"]
CheckName = Literal[
    "slot_has",
    "slot_lacks",
    "day_count_at_least",
    "day_count_at_most",
    "stay_changed",
    "options_offered",
    "itinerary_unchanged",
    "text_matches",
    "text_language",
    "brief_field",
    "max_seconds",
]

CHECK_PARAMS: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    # name: (required, optional)
    "slot_has": (
        frozenset({"day", "part"}),
        frozenset({"categories", "title_contains"}),
    ),
    "slot_lacks": (frozenset({"day", "title_contains"}), frozenset({"part"})),
    "day_count_at_least": (frozenset({"day", "n"}), frozenset({"part"})),
    "day_count_at_most": (frozenset({"day", "n"}), frozenset({"part"})),
    "stay_changed": (frozenset(), frozenset()),
    "options_offered": (frozenset(), frozenset({"kind"})),
    "itinerary_unchanged": (frozenset(), frozenset()),
    "text_matches": (frozenset({"pattern"}), frozenset()),
    "text_language": (frozenset({"language"}), frozenset()),
    "brief_field": (frozenset({"field", "value"}), frozenset()),
    "max_seconds": (frozenset({"n"}), frozenset()),
}
"""The parameters each listable check takes."""

_DATE_TOKEN = re.compile(r"\{date:\+(\d+)\}")


class Check(BaseModel):
    """One listed check: `check` names it, the other fields are its parameters.

    `CHECK_PARAMS` says which parameters each check needs.
    """

    model_config = ConfigDict(extra="forbid")

    check: CheckName
    day: int | None = Field(default=None, ge=1)
    part: DayPart | None = None
    categories: list[str] | None = None
    title_contains: str | None = None
    n: float | None = None
    kind: OptionKind | None = None
    pattern: str | None = None
    language: Language | None = None
    field: str | None = None
    value: str | int | float | bool | list[str] | None = None

    @model_validator(mode="after")
    def _params(self) -> "Check":
        required, optional = CHECK_PARAMS[self.check]
        given = self.model_fields_set - {"check"}
        if missing := required - given:
            raise ValueError(f"{self.check} needs {sorted(missing)}")
        if extra := given - required - optional:
            raise ValueError(f"{self.check} takes no {sorted(extra)}")
        if self.pattern is not None:
            try:
                re.compile(self.pattern)
            except re.error as exc:
                raise ValueError(f"bad pattern: {exc}") from exc
        if self.field is not None and self.field not in TripBrief.model_fields:
            raise ValueError(f"brief has no field {self.field!r}")
        return self

    @property
    def label(self) -> str:
        params = self.model_dump(exclude={"check"}, exclude_none=True)
        inner = ", ".join(f"{k}={v}" for k, v in params.items())
        return f"{self.check}({inner})" if inner else self.check


class SlotRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: int = Field(ge=1)
    part: DayPart


class SelectRef(BaseModel):
    """The `index`-th card of the latest group of kind `group`."""

    model_config = ConfigDict(extra="forbid")

    group: GroupKind
    index: int = Field(default=0, ge=0)
    slot: SlotRef | None = None

    @model_validator(mode="after")
    def _slot(self) -> "SelectRef":
        if self.group == "found" and self.slot is None:
            raise ValueError("a found: group carries no slot; name one")
        return self


class Step(BaseModel):
    model_config = ConfigDict(extra="forbid")

    say: str | None = Field(default=None, min_length=1)
    select: SelectRef | None = None
    setup: str | None = Field(
        default=None, pattern=r"^(draft|brief|fixture:[a-z0-9-]+)$"
    )
    patch_brief: dict[str, Any] | None = None
    expect: list[Check] = Field(default_factory=list)

    @model_validator(mode="after")
    def _one(self) -> "Step":
        kinds = [k for k in ("say", "select", "setup") if getattr(self, k) is not None]
        if len(kinds) != 1:
            raise ValueError("a step is one of say, select or setup")
        if self.patch_brief is not None and self.say is None:
            raise ValueError("patch_brief goes with the message that answers it")
        return self


class Scenario(BaseModel):
    """One scripted conversation and what a good planner leaves after it."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9-]+$")
    city: str
    language: Language
    tags: list[str]
    goal: str = Field(min_length=1)
    steps: list[Step] = Field(min_length=1)
    expect: list[Check] = Field(default_factory=list)

    @property
    def safety(self) -> bool:
        return SAFETY_TAG in self.tags


class FixtureDay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: int = Field(ge=1)
    title: str
    slots: dict[DayPart, list[str]]


class TripFixture(BaseModel):
    """A frozen trip: the brief, the stay and the days as corpus ids.

    The dates are set relative to the run's day.
    """

    model_config = ConfigDict(extra="forbid")

    city: str
    start_in_days: int = Field(default=DRAFT_START_IN_DAYS, ge=1)
    brief: dict[str, Any]
    stay: str
    days: list[FixtureDay] = Field(min_length=1)

    def ids(self) -> list[str]:
        ids = [self.stay]
        for day in self.days:
            for part in DAY_PARTS:
                ids += day.slots.get(part, [])
        return ids

    def trip_brief(self, today: date) -> TripBrief:
        start = today + timedelta(days=self.start_in_days)
        end = start + timedelta(days=len(self.days) - 1)
        values = {
            **TripBrief.empty().model_dump(),
            **self.brief,
            "start_date": start,
            "end_date": end,
            "nights": len(self.days) - 1,
        }
        return TripBrief.model_validate(values)


def _scenario_dirs(root: Traversable) -> list[Traversable]:
    return sorted(
        (d for d in root.iterdir() if d.is_dir() and d.name != _FIXTURES),
        key=lambda d: d.name,
    )


def scenario_cities(root: Traversable = _DATA) -> list[str]:
    return [d.name for d in _scenario_dirs(root)]


def load_scenarios(
    cities: Sequence[str] | None = None, root: Traversable = _DATA
) -> list[Scenario]:
    """Every scenario of `cities` (all when `None`), by city then id."""
    scenarios: list[Scenario] = []
    for directory in _scenario_dirs(root):
        if cities is not None and directory.name not in cities:
            continue
        paths = sorted(
            (p for p in directory.iterdir() if p.name.endswith(".json")),
            key=lambda p: p.name,
        )
        scenarios += [
            Scenario.model_validate_json(p.read_text(encoding="utf-8")) for p in paths
        ]
    return scenarios


def load_fixture(name: str, root: Traversable = _DATA) -> TripFixture:
    path = root / _FIXTURES / f"{name}.json"
    return TripFixture.model_validate_json(path.read_text(encoding="utf-8"))


def select_scenarios(
    scenarios: Sequence[Scenario],
    *,
    ids: Sequence[str] = (),
    tags: Sequence[str] = (),
) -> list[Scenario]:
    """Those named by id, or carrying any of `tags`; all when neither is given."""
    return [
        s
        for s in scenarios
        if (not ids or s.id in ids) and (not tags or set(tags) & set(s.tags))
    ]


def fill(text: str, today: date, city: str) -> str:
    """`{date:+N}` → today + N days (ISO); `{city}` → the city's name."""
    text = _DATE_TOKEN.sub(
        lambda m: (today + timedelta(days=int(m.group(1)))).isoformat(), text
    )
    return text.replace("{city}", city)


def _fill_value(value: Any, today: date, city: str) -> Any:
    if isinstance(value, str):
        return fill(value, today, city)
    if isinstance(value, list):
        return [_fill_value(v, today, city) for v in cast(list[Any], value)]
    return value


@dataclass(slots=True)
class Bubble:
    """One entry of the transcript, as the page keeps it."""

    kind: Literal["text", "options", "selection"]
    role: Literal["user", "assistant"] = "assistant"
    content: str = ""
    group_id: str | None = None
    titles: tuple[str, ...] = ()


@dataclass(slots=True)
class GroupState:
    """A carousel on screen: the event's fields plus what was picked."""

    event: OptionsEvent
    cards: list[OptionCard]
    selected_ids: list[str] = field(default_factory=list)


def _part_of(slot: Slot) -> DayPart:
    """An unpinned slot goes to the morning, as `partOf` does."""
    return slot.part or "morning"


def _empty_day() -> dict[DayPart, list[OptionCard]]:
    return {part: [] for part in DAY_PARTS}


@dataclass
class ClientState:
    """What the page holds, changed by the same rules as `plannerReducer.ts`."""

    brief: TripBrief = field(default_factory=TripBrief.empty)
    stay: OptionCard | None = None
    days: dict[int, dict[DayPart, list[OptionCard]]] = field(default_factory=dict)
    day_titles: dict[int, str] = field(default_factory=dict)
    messages: list[Bubble] = field(default_factory=list)
    groups: dict[str, GroupState] = field(default_factory=dict)
    received: list[OptionsEvent] = field(default_factory=list)
    """Every options event, in the order received."""
    texts_this_turn: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    seen_ids: set[str] = field(default_factory=set)
    """Every card id the client was shown, for `all_ids_in_corpus`."""
    whys: list[str] = field(default_factory=list)

    def apply(self, event: PlannerEvent) -> None:
        """Apply one event as `applyEventToDraft` does."""
        if isinstance(event, TextEvent):
            self.texts_this_turn.append(event.delta)
            last = self.messages[-1] if self.messages else None
            if last is not None and last.kind == "text" and last.role == "assistant":
                last.content += event.delta
            else:
                self.messages.append(Bubble("text", "assistant", event.delta))
        elif isinstance(event, BriefEvent):
            self.brief = event.brief
        elif isinstance(event, OptionsEvent):
            self._options(event)
        elif isinstance(event, ItineraryPatchEvent):
            for op in event.ops:
                self.apply_op(op)
        elif isinstance(event, ErrorEvent):
            self.errors.append(f"{event.error_code}: {event.error}")
            self._drop_empty_tail()

    def _options(self, event: OptionsEvent) -> None:
        self.received.append(event)
        self._saw(event.cards)
        self._drop_empty_tail()
        known = self.groups.get(event.group_id)
        if known is not None and known.event.slot is None and known.selected_ids:
            # a stay or a neighbourhood asked again once one was chosen: the
            # group starts over at the foot of the transcript
            del self.groups[event.group_id]
            self.messages = [
                m
                for m in self.messages
                if not (m.kind == "options" and m.group_id == event.group_id)
            ]
            self.groups[event.group_id] = GroupState(event, list(event.cards))
            self.messages.append(Bubble("options", group_id=event.group_id))
        elif known is not None:
            # "more options": new cards join the carousel already on screen
            fresh = [c for c in event.cards if all(k.id != c.id for k in known.cards)]
            known.event = event
            known.cards = [*known.cards, *fresh]
        else:
            self.groups[event.group_id] = GroupState(event, list(event.cards))
            self.messages.append(Bubble("options", group_id=event.group_id))

    def apply_op(self, op: ItineraryOp) -> None:
        """`applyItineraryOp`: the ops that change what the snapshot holds."""
        if isinstance(op, SetStayOp):
            self._saw([op.card])
            self.stay = op.card
        elif isinstance(op, PutActivityOp):
            self._saw([op.card])
            part = _part_of(op.slot)
            day = self.days.setdefault(op.slot.day, _empty_day())
            for other in DAY_PARTS:
                if other == part:
                    continue
                day[other] = [c for c in day[other] if c.id != op.card.id]
            cards = day[part]
            if any(c.id == op.card.id for c in cards):
                day[part] = [op.card if c.id == op.card.id else c for c in cards]
            else:
                cards.append(op.card)
        elif isinstance(op, RemoveActivityOp):
            part = _part_of(op.slot)
            day = self.days.setdefault(op.slot.day, _empty_day())
            day[part] = [c for c in day[part] if c.id != op.card_id]
        elif isinstance(op, SetDayTitleOp):
            self.days.setdefault(op.day, _empty_day())
            self.day_titles[op.day] = op.title
        else:
            # route, weather and warnings change nothing the snapshot sends,
            # but a weather op still opens its day, as `withDay` does (a warn op
            # carries a slot, not a day, and the reducer leaves its days alone)
            day_of = getattr(op, "day", None)
            if isinstance(day_of, int):
                self.days.setdefault(day_of, _empty_day())

    def _saw(self, cards: Iterable[OptionCard]) -> None:
        for card in cards:
            self.seen_ids.add(card.id)
            if card.why:
                self.whys.append(card.why)

    def turn_started(self, message: str | None) -> None:
        self._drop_empty_tail()
        if message:
            self.messages.append(Bubble("text", "user", message))
        self.messages.append(Bubble("text", "assistant", ""))
        self.texts_this_turn = []

    def turn_finished(self) -> None:
        self._drop_empty_tail()

    def patch_brief(self, patch: dict[str, Any]) -> None:
        """`brief_patched`: a checklist answer, before the server confirms it."""
        self.brief = TripBrief.model_validate({**self.brief.model_dump(), **patch})

    def selected(
        self, group_id: str, card_ids: Sequence[str], slot: Slot | None
    ) -> None:
        """`selected`: the chip, and the optimistic itinerary update."""
        group = self.groups.get(group_id)
        if group is None:
            return
        picked = [c for c in group.cards if c.id in card_ids]
        if not picked:
            return
        event = group.event
        where = event.slot or slot
        if event.kind == "hotel":
            self.apply_op(SetStayOp(op="set_stay", card=picked[0]))
        elif where is not None:
            if event.slot is not None and event.selection == "single":
                # a single pick in a group with its own slot replaces what the
                # slot held (the "Change" flow)
                held = self.days.get(where.day, {}).get(_part_of(where), [])
                for card in list(held):
                    self.apply_op(
                        RemoveActivityOp(
                            op="remove_activity", slot=where, card_id=card.id
                        )
                    )
            for card in picked:
                self.apply_op(PutActivityOp(op="put_activity", slot=where, card=card))
        group.selected_ids = [c.id for c in picked]
        self._drop_empty_tail()
        self.messages.append(Bubble("selection", titles=tuple(c.title for c in picked)))

    def _drop_empty_tail(self) -> None:
        last = self.messages[-1] if self.messages else None
        if (
            last is not None
            and last.kind == "text"
            and last.role == "assistant"
            and not last.content
        ):
            self.messages.pop()

    def history(self, limit: int = HISTORY_LIMIT) -> list[ChatMessage]:
        """`toHistory`: the non-empty text bubbles, the last `limit`."""
        texts = [m for m in self.messages if m.kind == "text" and m.content]
        return [ChatMessage(role=m.role, content=m.content) for m in texts[-limit:]]

    def snapshot(self) -> ItinerarySnapshot:
        """`toItinerarySnapshot`: the itinerary the page sends."""
        return ItinerarySnapshot(
            stay_card_id=self.stay.id if self.stay else None,
            days=[
                DaySnapshot(
                    day=number,
                    slots=DaySlots(
                        **{p: [c.id for c in self.days[number][p]] for p in DAY_PARTS}
                    ),
                )
                for number in sorted(self.days)
            ],
        )

    def to_turn(
        self,
        message: str | None,
        action: SelectAction | None,
        language: Language,
        *,
        history: Sequence[ChatMessage] | None = None,
    ) -> PlannerTurn:
        """The request the page sends.

        `history` is the transcript before the turn started (default: the
        current one).
        """
        return PlannerTurn(
            message=message,
            action=action,
            history=list(self.history() if history is None else history),
            brief=self.brief,
            itinerary=self.snapshot(),
            exclude_card_ids=[],
            trip_id=None,
            session_id=None,
            language=language,
        )

    def begin(
        self,
        message: str | None,
        language: Language,
        *,
        select: SelectAction | None = None,
        patch: dict[str, Any] | None = None,
    ) -> PlannerTurn:
        """`runTurn`'s preamble, then the request.

        The transcript as it stood, the local action (a pick or a checklist
        answer) and `turn_started`.
        """
        history = self.history()
        if select is not None:
            self.selected(select.group_id, select.card_ids, select.slot)
        if patch is not None:
            self.patch_brief(patch)
        self.turn_started(message)
        return self.to_turn(message, select, language, history=history)

    def latest_group(self, kind: GroupKind) -> GroupState | None:
        prefix = "nb" if kind == "nb" else f"{kind}:"
        for event in reversed(self.received):
            gid = event.group_id
            if (gid == prefix if kind == "nb" else gid.startswith(prefix)) and (
                gid in self.groups
            ):
                return self.groups[gid]
        return None

    def cards_in(self, day: int, part: DayPart | None = None) -> list[OptionCard]:
        slots = self.days.get(day, {})
        parts: list[DayPart] = [part] if part else list(DAY_PARTS)
        return [card for p in parts for card in slots.get(p, [])]

    def itinerary_key(self) -> str:
        """The snapshot without empty days, to compare two moments."""
        snapshot = self.snapshot()
        snapshot.days = [
            d for d in snapshot.days if any(getattr(d.slots, p) for p in DAY_PARTS)
        ]
        return snapshot.model_dump_json()

    def assistant_texts(self) -> list[str]:
        return [
            m.content
            for m in self.messages
            if m.kind == "text" and m.role == "assistant" and m.content
        ]

    def transcript(self) -> str:
        lines: list[str] = []
        for m in self.messages:
            if m.kind == "text" and m.content:
                who = "Traveller" if m.role == "user" else "Planner"
                lines.append(f"{who}: {m.content}")
            elif m.kind == "selection":
                lines.append(f"Traveller picked: {', '.join(m.titles)}")
            elif m.kind == "options" and m.group_id in self.groups:
                group = self.groups[m.group_id]
                titles = "; ".join(c.title for c in group.cards)
                lines.append(f"Planner offered ({group.event.kind}): {titles}")
        return "\n".join(lines)

    def itinerary_text(self) -> str:
        lines = [f"Stay: {self.stay.title if self.stay else '(none)'}"]
        for number in sorted(self.days):
            title = self.day_titles.get(number)
            lines.append(f"Day {number}" + (f" — {title}" if title else ""))
            for part in DAY_PARTS:
                cards = self.days[number][part]
                if cards:
                    names = ", ".join(f"{c.title} [{c.category}]" for c in cards)
                    lines.append(f"  {part}: {names}")
        return "\n".join(lines)


@dataclass(frozen=True, slots=True)
class CheckResult:
    name: str
    passed: bool
    detail: str
    safety: bool


@dataclass(slots=True)
class StepOutcome:
    """What one step did: the itinerary before it, its texts, groups, time."""

    before_key: str
    before_stay: str | None
    texts: list[str] = field(default_factory=list)
    groups: list[OptionsEvent] = field(default_factory=list)
    seconds: list[float] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(self.texts)


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.casefold())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _titled(cards: Iterable[OptionCard], words: str) -> list[OptionCard]:
    wanted = _fold(words)
    return [c for c in cards if wanted in _fold(c.title)]


def _other(language: Language) -> Language:
    return "es" if language == "en" else "en"


def evaluate(
    check: Check, state: ClientState, outcome: StepOutcome
) -> tuple[bool, str]:
    """One listed check against the state after a step."""
    name = check.check
    if name == "slot_has":
        day, part = cast(int, check.day), cast(DayPart, check.part)
        cards = state.cards_in(day, part)
        if check.categories:
            cards = [c for c in cards if c.category in check.categories]
        if check.title_contains:
            cards = _titled(cards, check.title_contains)
        held = ", ".join(c.title for c in state.cards_in(day, part)) or "empty"
        return bool(cards), f"day {day} {part}: {held}"
    if name == "slot_lacks":
        day = cast(int, check.day)
        found = _titled(
            state.cards_in(day, check.part), cast(str, check.title_contains)
        )
        return not found, (
            f"found {', '.join(c.title for c in found)}" if found else "absent"
        )
    if name in ("day_count_at_least", "day_count_at_most"):
        day, n = cast(int, check.day), cast(float, check.n)
        count = len(state.cards_in(day, check.part))
        if name == "day_count_at_least":
            return count >= n, f"{count} card(s), wanted at least {n:g}"
        return 0 < count <= n, f"{count} card(s), wanted 1 to {n:g}"
    if name == "stay_changed":
        now = state.stay.id if state.stay else None
        return (
            now is not None and now != outcome.before_stay,
            f"{outcome.before_stay} → {now}",
        )
    if name == "options_offered":
        groups = [
            g for g in outcome.groups if check.kind is None or g.kind == check.kind
        ]
        kinds = ", ".join(sorted({g.kind for g in outcome.groups})) or "none"
        return bool(groups), f"offered: {kinds}"
    if name == "itinerary_unchanged":
        same = state.itinerary_key() == outcome.before_key
        return same, "unchanged" if same else "the itinerary changed"
    if name == "text_matches":
        pattern = re.compile(cast(str, check.pattern), re.IGNORECASE)
        return bool(pattern.search(outcome.text)), _excerpt(outcome.text)
    if name == "text_language":
        expected = cast(Language, check.language)
        got = detect_language([outcome.text], page=_other(expected))
        return got == expected, f"reads as {got}"
    if name == "brief_field":
        actual = state.brief.model_dump(mode="json").get(cast(str, check.field))
        wanted = check.value
        if isinstance(actual, list) and isinstance(wanted, str):
            passed = wanted in actual
        else:
            passed = actual == wanted
        return passed, f"{check.field} = {actual!r}"
    # max_seconds
    slowest = max(outcome.seconds, default=0.0)
    return slowest <= cast(float, check.n), f"slowest turn {slowest:.1f}s"


def no_prices(state: ClientState) -> tuple[bool, str]:
    priced = [t for t in [*state.assistant_texts(), *state.whys] if strip_prices(t)[1]]
    return not priced, (_excerpt(priced[0]) if priced else "none")


def no_error_events(state: ClientState) -> tuple[bool, str]:
    return not state.errors, "; ".join(state.errors) or "none"


async def all_ids_in_corpus(
    state: ClientState, retriever: Retriever
) -> tuple[bool, str]:
    ids = sorted(state.seen_ids)
    found = {d.id for d in await retriever.fetch(ids)} if ids else set()
    unknown = [i for i in ids if i not in found]
    return not unknown, (
        f"unknown: {', '.join(unknown[:5])}" if unknown else f"{len(ids)} ids"
    )


def _excerpt(text: str, size: int = 160) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= size else flat[: size - 1] + "…"


Planner = Callable[[PlannerTurn], AsyncIterator[PlannerEvent]]
"""A `PlanTrip` (or anything that answers a turn the same way)."""


class ConversationVerdict(BaseModel):
    """What the judge returns for one conversation."""

    did_what_was_asked: int = Field(
        ge=1, le=5, description="Did the planner do what the traveller asked? 1-5."
    )
    tone: int = Field(ge=1, le=5, description="Natural, brief, friendly? 1-5.")
    reason: str = Field(description="One sentence explaining the scores.")


@dataclass(slots=True)
class ScenarioRun:
    scenario: Scenario
    run: int
    checks: list[CheckResult] = field(default_factory=list)
    setup_failed: str | None = None
    seconds: float = 0.0
    turns: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    llm_calls: int = 0
    model: str | None = None
    verdict: ConversationVerdict | None = None
    judge_error: str | None = None
    judge_usage: Usage = field(default_factory=Usage)
    transcript: str = ""
    itinerary: str = ""

    @property
    def passed(self) -> bool:
        return self.setup_failed is None and all(c.passed for c in self.checks)


@dataclass(frozen=True, slots=True)
class ConversationReport:
    runs: list[ScenarioRun]
    repeat: int
    judge_prompt: str | None


class SetupFailed(Exception):
    """The scenario never reached the state its steps start from."""


TEXTS: dict[Language, dict[str, str]] = {
    "en": {
        "opening": (
            "I want {days} days in {city} from Madrid, {start} to {end}, 2 adults, "
            "a balanced pace, into history and food"
        ),
        "destination": "{city}",
        "origin": "From Madrid",
        "dates": "Dates: {start} · {end}",
        "travellers": "2 adults",
        "interests": "History and food",
        "nudge": "Which neighbourhoods do you suggest?",
    },
    "es": {
        "opening": (
            "Quiero {days} días en {city} desde Madrid, del {start} al {end}, "
            "2 adultos, ritmo equilibrado, me interesan la historia y la "
            "gastronomía"
        ),
        "destination": "{city}",
        "origin": "Desde Madrid",
        "dates": "Fechas: {start} · {end}",
        "travellers": "2 adultos",
        "interests": "Historia y gastronomía",
        "nudge": "¿Qué barrios me recomiendas?",
    },
}
"""What `setup: draft` types: the opening, then one answer per missing field."""


class _Session:
    """One scenario run: the client state, the planner and the clock."""

    def __init__(
        self,
        scenario: Scenario,
        run: ScenarioRun,
        plan: Planner,
        retriever: Retriever,
        *,
        today: date,
        city_name: str,
        data: Traversable = _DATA,
    ) -> None:
        self.scenario = scenario
        self.result = run
        self.plan = plan
        self.retriever = retriever
        self.today = today
        self.city_name = city_name
        self.data = data
        self.state = ClientState()
        self.outcome = self._new_outcome()

    def _new_outcome(self) -> StepOutcome:
        return StepOutcome(
            before_key=self.state.itinerary_key(),
            before_stay=self.state.stay.id if self.state.stay else None,
        )

    def fill(self, text: str) -> str:
        return fill(text, self.today, self.city_name)

    async def turn(
        self,
        message: str | None,
        *,
        select: SelectAction | None = None,
        patch: dict[str, Any] | None = None,
    ) -> None:
        request = self.state.begin(
            message, self.scenario.language, select=select, patch=patch
        )
        tracer = TurnTracer("planner", "/eval/conversations", "eval")
        received = len(self.state.received)
        started = time.perf_counter()
        try:
            with use_tracer(tracer):
                async for event in self.plan(request):
                    self.state.apply(event)
        except DomainError as exc:
            # what `sse.sse_events` would send the page in-band
            self.state.apply(
                ErrorEvent(type="error", error=exc.message, error_code=exc.error_code)
            )
        except Exception as exc:  # the page sees a generic error, not a crash
            self.state.apply(
                ErrorEvent(type="error", error=repr(exc), error_code="internal")
            )
        elapsed = time.perf_counter() - started
        self.state.turn_finished()
        self.outcome.texts += self.state.texts_this_turn
        self.outcome.groups += self.state.received[received:]
        self.outcome.seconds.append(elapsed)
        run = self.result
        run.turns += 1
        run.seconds += elapsed
        run.input_tokens += tracer.input_tokens
        run.output_tokens += tracer.output_tokens
        run.llm_calls += tracer.llm_calls
        run.model = tracer.model or run.model

    async def select(self, ref: SelectRef) -> str | None:
        """Picks a card; the reason when there is nothing to pick."""
        group = self.state.latest_group(ref.group)
        if group is None:
            return f"no {ref.group} group was offered"
        if ref.index >= len(group.cards):
            return f"{group.event.group_id} has {len(group.cards)} card(s)"
        slot = Slot(day=ref.slot.day, part=ref.slot.part) if ref.slot else None
        action = SelectAction(
            type="select",
            group_id=group.event.group_id,
            card_ids=[group.cards[ref.index].id],
            slot=None if group.event.slot is not None else slot,
        )
        await self.turn(None, select=action)
        return None

    async def setup(self, spec: str) -> None:
        if spec.startswith("fixture:"):
            await self._fixture(spec.removeprefix("fixture:"))
        else:
            await self._draft(through_hotel=spec == "draft")

    async def _fixture(self, name: str) -> None:
        fixture = load_fixture(name, self.data)
        ids = fixture.ids()
        documents = {d.id: d for d in await self.retriever.fetch(ids)}
        if missing := [i for i in ids if i not in documents]:
            raise SetupFailed(f"fixture {name}: not in the corpus: {missing}")
        state = self.state
        state.brief = fixture.trip_brief(self.today)
        [state.stay] = cards_for([documents[fixture.stay]], {})
        state.seen_ids.add(fixture.stay)
        for day in fixture.days:
            slots = _empty_day()
            for part, part_ids in day.slots.items():
                slots[part] = cards_for([documents[i] for i in part_ids], {})
                state.seen_ids.update(part_ids)
            state.days[day.day] = slots
            state.day_titles[day.day] = day.title

    async def _draft(self, *, through_hotel: bool) -> None:
        texts = TEXTS[self.scenario.language]
        start = self.today + timedelta(days=DRAFT_START_IN_DAYS)
        end = start + timedelta(days=DRAFT_DAYS - 1)
        values = {
            "days": DRAFT_DAYS,
            "city": self.city_name,
            "start": start.isoformat(),
            "end": end.isoformat(),
        }
        await self.turn(texts["opening"].format(**values))
        for _ in range(SETUP_ANSWERS):
            if self.state.latest_group("nb") is not None:
                break
            missing = self.state.brief.missing()
            answer = (
                ". ".join(texts[f].format(**values) for f in missing)
                if missing
                else texts["nudge"]
            )
            await self.turn(answer)
        if self.state.latest_group("nb") is None:
            raise SetupFailed(
                f"no neighbourhoods after the brief (missing {self.state.brief.missing()})"
            )
        if not through_hotel:
            return
        if reason := await self.select(SelectRef(group="nb")):
            raise SetupFailed(reason)
        if reason := await self.select(SelectRef(group="hotels")):
            raise SetupFailed(f"after a neighbourhood: {reason}")
        if self.state.stay is None:
            raise SetupFailed("no stay after picking a hotel")

    async def step(self, step: Step) -> str | None:
        """Runs one step; the reason when it could not be played."""
        self.outcome = self._new_outcome()
        if step.setup is not None:
            await self.setup(step.setup)
            return None
        if step.select is not None:
            return await self.select(step.select)
        patch = (
            {
                k: _fill_value(v, self.today, self.city_name)
                for k, v in step.patch_brief.items()
            }
            if step.patch_brief is not None
            else None
        )
        await self.turn(self.fill(cast(str, step.say)), patch=patch)
        return None

    def checks(self, checks: Sequence[Check]) -> list[CheckResult]:
        results = []
        for check in checks:
            filled = check.model_copy(
                update={
                    "value": _fill_value(check.value, self.today, self.city_name),
                    "title_contains": (
                        self.fill(check.title_contains)
                        if check.title_contains
                        else None
                    ),
                }
            )
            passed, detail = evaluate(filled, self.state, self.outcome)
            results.append(
                CheckResult(check.label, passed, detail, self.scenario.safety)
            )
        return results


async def play(
    scenario: Scenario,
    plan: Planner,
    retriever: Retriever,
    *,
    run: int = 1,
    today: date,
    city_name: str,
    judge: LLMProvider | None = None,
    data: Traversable = _DATA,
) -> ScenarioRun:
    """One scenario, start to end: steps, step checks, final and always checks."""
    result = ScenarioRun(scenario, run)
    session = _Session(
        scenario,
        result,
        plan,
        retriever,
        today=today,
        city_name=city_name,
        data=data,
    )
    safety = scenario.safety
    for index, step in enumerate(scenario.steps):
        try:
            problem = await session.step(step)
        except SetupFailed as exc:
            result.setup_failed = str(exc)
            return result
        if problem is not None:
            # the rest cannot be played: its checks fail, so totals stay fixed
            result.checks.append(
                CheckResult(f"step {index + 1}", False, problem, safety)
            )
            later = [c for s in scenario.steps[index:] for c in s.expect]
            result.checks += [
                CheckResult(c.label, False, "step not reached", safety)
                for c in [*later, *scenario.expect]
            ]
            break
        result.checks += session.checks(step.expect)
    else:
        result.checks += session.checks(scenario.expect)
    state = session.state
    for name, (passed, detail) in (
        ("all_ids_in_corpus", await all_ids_in_corpus(state, retriever)),
        ("no_prices", no_prices(state)),
        ("no_error_events", no_error_events(state)),
    ):
        result.checks.append(
            CheckResult(name, passed, detail, safety or name in SAFETY_ALWAYS)
        )
    result.transcript = state.transcript()
    result.itinerary = state.itinerary_text()
    if judge is not None:
        await _judge(result, judge)
    return result


async def _judge(result: ScenarioRun, judge: LLMProvider) -> None:
    try:
        result.verdict = await complete_json(
            judge,
            [
                Message("system", CONVERSATION_JUDGE_PROMPT),
                Message(
                    "user",
                    conversation_judge_request(result.transcript, result.itinerary),
                ),
            ],
            ConversationVerdict,
            name="conversation_judge",
            usage=result.judge_usage,
            template=CONVERSATION_JUDGE_PROMPT,
        )
    except DomainError as exc:
        result.judge_error = exc.message


async def run(
    scenarios: Sequence[Scenario],
    plan_trip_factory: Callable[[str], Planner],
    retriever_for: Callable[[str], Retriever],
    *,
    city_names: dict[str, str] | None = None,
    repeat: int = 1,
    concurrency: int = CONCURRENCY,
    judge: LLMProvider | None = None,
    data: Traversable = _DATA,
    today: Callable[[], date] = date.today,
) -> ConversationReport:
    """Every scenario `repeat` times, `concurrency` at a time, in order.

    `plan_trip_factory(city)` and `retriever_for(city)` give the planner and
    the retriever of a city's slug; `city_names` how `{city}` is written.
    """
    gate = asyncio.Semaphore(concurrency)
    names = city_names or {}

    async def one(scenario: Scenario, index: int) -> ScenarioRun:
        async with gate:
            return await play(
                scenario,
                plan_trip_factory(scenario.city),
                retriever_for(scenario.city),
                run=index,
                today=today(),
                city_name=names.get(scenario.city, scenario.city.title()),
                judge=judge,
                data=data,
            )

    runs = await asyncio.gather(
        *(one(s, i) for s in scenarios for i in range(1, repeat + 1))
    )
    return ConversationReport(
        runs=list(runs),
        repeat=repeat,
        judge_prompt=prompt_version(CONVERSATION_JUDGE_PROMPT) if judge else None,
    )


@dataclass(frozen=True, slots=True)
class Totals:
    runs: int
    scenarios_passed: float
    """Mean over the repeats of the scenarios whose every check passed."""
    scenarios: int
    checks_passed: int
    checks: int
    safety_passed: int
    safety: int
    setup_failed: int
    input_tokens: int
    output_tokens: int
    llm_calls: int

    @property
    def pass_rate(self) -> float:
        return self.checks_passed / self.checks if self.checks else 0.0

    @property
    def safety_rate(self) -> float:
        return self.safety_passed / self.safety if self.safety else 1.0


def totals(report: ConversationReport) -> Totals:
    runs = report.runs
    checks = [c for r in runs for c in r.checks]
    safety = [c for c in checks if c.safety]
    scenarios = {(r.scenario.city, r.scenario.id) for r in runs}
    return Totals(
        runs=len(runs),
        scenarios_passed=sum(r.passed for r in runs) / max(report.repeat, 1),
        scenarios=len(scenarios),
        checks_passed=sum(c.passed for c in checks),
        checks=len(checks),
        safety_passed=sum(c.passed for c in safety),
        safety=len(safety),
        setup_failed=sum(r.setup_failed is not None for r in runs),
        input_tokens=sum(r.input_tokens for r in runs),
        output_tokens=sum(r.output_tokens for r in runs),
        llm_calls=sum(r.llm_calls for r in runs),
    )


def safety_failed(report: ConversationReport) -> bool:
    return any(not c.passed for r in report.runs for c in r.checks if c.safety)


def _by_scenario(report: ConversationReport) -> list[list[ScenarioRun]]:
    grouped: dict[tuple[str, str], list[ScenarioRun]] = {}
    for r in report.runs:
        grouped.setdefault((r.scenario.city, r.scenario.id), []).append(r)
    return list(grouped.values())


def to_markdown(report: ConversationReport) -> str:
    """A row per scenario, the totals, the failures."""
    judged = report.judge_prompt is not None
    header = (
        "| Scenario | City | Lang | Tags | Checks | Runs passed | Seconds "
        "| Tokens in / out | LLM calls |"
    )
    rule = "|---|---|---|---|---:|---:|---:|---:|---:|"
    if judged:
        header += " Judge (asked · tone) |"
        rule += "---:|"
    lines = [header, rule]
    for runs in _by_scenario(report):
        s = runs[0].scenario
        checks = [c for r in runs for c in r.checks]
        n = len(runs)
        row = (
            f"| `{s.id}` | {s.city} | {s.language} | {', '.join(s.tags)} "
            f"| {sum(c.passed for c in checks)}/{len(checks)} "
            f"| {sum(r.passed for r in runs)}/{n} "
            f"| {fmean(r.seconds for r in runs):.0f} "
            f"| {fmean(r.input_tokens for r in runs):,.0f} / "
            f"{fmean(r.output_tokens for r in runs):,.0f} "
            f"| {fmean(r.llm_calls for r in runs):.1f} |"
        )
        if judged:
            verdicts = [r.verdict for r in runs if r.verdict is not None]
            row += (
                f" {fmean(v.did_what_was_asked for v in verdicts):.1f} · "
                f"{fmean(v.tone for v in verdicts):.1f} |"
                if verdicts
                else " — |"
            )
        lines.append(row)

    t = totals(report)
    lines += [
        "",
        f"Scenarios passed: **{t.scenarios_passed:.2f} of {t.scenarios}** "
        f"(mean over {report.repeat} run(s) each).",
        f"Checks passed: **{t.checks_passed}/{t.checks} ({t.pass_rate:.0%})**; "
        f"safety checks: **{t.safety_passed}/{t.safety} ({t.safety_rate:.0%})**.",
        f"Setup failures: {t.setup_failed} of {t.runs} runs.",
        f"Planner: {t.input_tokens:,} tokens in, {t.output_tokens:,} out, "
        f"{t.llm_calls} model calls.",
    ]
    if judged:
        lines.append(f"Judge prompt `{report.judge_prompt}`.")

    tags = sorted({tag for r in report.runs for tag in r.scenario.tags})
    lines += ["", "| Tag | Checks passed |", "|---|---:|"]
    for tag in tags:
        checks = [c for r in report.runs if tag in r.scenario.tags for c in r.checks]
        passed = sum(c.passed for c in checks)
        rate = passed / len(checks) if checks else 0.0
        lines.append(f"| {tag} | {passed}/{len(checks)} ({rate:.0%}) |")

    failures = [(r, c) for r in report.runs for c in r.checks if not c.passed]
    lines += ["", "Failed checks:", ""]
    if not failures:
        lines.append("- none")
    for r, c in failures:
        mark = " **safety**" if c.safety else ""
        lines.append(f"- `{r.scenario.id}` (run {r.run}){mark}: {c.name} — {c.detail}")
    setup = [r for r in report.runs if r.setup_failed is not None]
    if setup:
        lines += ["", "Setup failures:", ""]
        lines += [f"- `{r.scenario.id}` (run {r.run}): {r.setup_failed}" for r in setup]
    judge_errors = [r for r in report.runs if r.judge_error]
    if judge_errors:
        lines += ["", "Judge failures:", ""]
        lines += [
            f"- `{r.scenario.id}` (run {r.run}): {r.judge_error}" for r in judge_errors
        ]
    return "\n".join(lines)


def report_json(report: ConversationReport) -> str:
    """Every run as JSON, for a person to read the conversations."""
    rows = [
        {
            "scenario": r.scenario.id,
            "run": r.run,
            "passed": r.passed,
            "setup_failed": r.setup_failed,
            "checks": [
                {"name": c.name, "passed": c.passed, "detail": c.detail}
                for c in r.checks
            ],
            "seconds": round(r.seconds, 1),
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "llm_calls": r.llm_calls,
            "verdict": r.verdict.model_dump() if r.verdict else None,
            "transcript": r.transcript,
            "itinerary": r.itinerary,
        }
        for r in report.runs
    ]
    return json.dumps(rows, ensure_ascii=False, indent=1)
