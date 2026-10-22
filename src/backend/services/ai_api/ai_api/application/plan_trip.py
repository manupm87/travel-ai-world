"""Use case: one planner turn in, a stream of typed events out (ADR 0015).

The service keeps nothing between requests, so every turn is decided from
what the client sends: the brief, the itinerary snapshot (card ids), the
transcript, and either a message or a structured action on a carousel the
server sent earlier. Group ids carry their meaning (`nb`, `hotels:<district>`,
`slot:<day>:<part>`) so a selection can be read back without a session.

The model never writes a place. It extracts the brief, ranks candidates the
retriever found, picks ids and explains its picks; every card is hydrated
from the corpus document behind the id (`cards.py`), and an id that was not
retrieved is dropped. Prices are tiers, flights a prefilled search link,
weather a forecast or the corpus's climate normals.

A message is the brief's checklist until the brief is complete; from there
Kiri, one tool-using agent (`application/agent/`, ADR 0032), runs the
conversation, before the stay and after it (TRA-291). Selections, removals
and the page's own asks ("Alternatives for day N · part", "Generate the
trip") stay deterministic.

Every message goes through the input guard first (TRA-292, a Bedrock
Guardrail when configured): one it stops is answered with a fixed sentence
and reaches no model.
"""

import asyncio
import logging
import re
import unicodedata
from collections.abc import AsyncIterator, Callable, Iterable, Mapping, Sequence
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal, cast
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel, Field
from travel_common.exceptions import DomainError

from ai_api.application.cards import card_from_document, cards_for, title_of
from ai_api.application.language import (
    RECENT_MESSAGES,
    Language,
    detect_language,
)
from ai_api.application.photos import PhotoTally, ensure_photos
from ai_api.application.progress import PackingProgress
from ai_api.application.structured import complete_json
from ai_api.application.tracing import (
    NullTracer,
    TurnTracer,
    clip_query,
    current_tracer,
    filters_payload,
    traced_llm_stream,
)
from ai_api.application.validate import Placed, strip_prices, validate_day
from ai_api.domain.models import (
    City,
    DayWeather,
    Document,
    Message,
    Photo,
    RetrievalFilters,
)
from ai_api.domain.ports import (
    InputGuard,
    LLMProvider,
    PhotoFinder,
    Retriever,
    SitePreviewFinder,
    WeatherForecast,
)
from ai_api.domain.tracing import Phase
from ai_api.infrastructure.bedrock_guard import NullInputGuard
from ai_api.infrastructure.static_flight_search import route_for
from ai_api.prompts import (
    AGENT_PRE_STAY_PROMPT,
    AGENT_SYSTEM_PROMPT,
    ASK_MISSING_PROMPT,
    BRIEF_EXTRACTION_PROMPT,
    CHAT_INTRO,
    DAY_PICKS_PROMPT,
    LANGUAGE_NAMES,
    PART_NAMES,
    PICK_HOTELS_PROMPT,
    PICK_OPTIONS_PROMPT,
    PLANNER_PERSONA,
    RAG_CONTEXT_PROMPT,
    RANK_NEIGHBOURHOODS_PROMPT,
    SKELETON_PROMPT,
    cities_for_prompt,
    format_context,
    join_names,
    planner_text,
)
from ai_api.schemas.planner import PlannerTurn, RemoveAction, SelectAction
from ai_api.schemas.planner_events import (
    DAY_PARTS,
    DayPart,
    OptionCard,
    OptionKind,
    Pace,
    PlannerEvent,
    Slot,
    TripBrief,
    brief_event,
    options,
    patch,
    put_activity,
    set_day_title,
    set_route,
    set_stay,
    set_weather,
    text,
    warn,
)
from ai_api.schemas.planner_events import ItineraryOp as Op

logger = logging.getLogger(__name__)

SIGHT_CATEGORIES = ("see", "do", "tour", "history")
EAT_CATEGORIES = ("eat",)
DRINK_CATEGORIES = ("drink",)
STAY_CATEGORIES = ("sleep",)

EAT_DRINK = frozenset({*EAT_CATEGORIES, *DRINK_CATEGORIES})
"""A carousel of these alone is a `restaurant` one; anything else is experience."""

EAT_DRINK_CATEGORIES = (*EAT_CATEGORIES, *DRINK_CATEGORIES)
"""A place to eat *or* to drink: what a `restaurant` ask means when no part of
the day narrows it, so a wine bar or a ruin bar is reachable too (TRA-186)."""

OPTIONS_COUNT = 3
"""Cards per carousel: enough to choose from, few enough to read."""

CHAT_PASSAGES = 6
"""Passages a question's answer is grounded on (`chat_messages`, the answer eval)."""

EMPTY_ITINERARY = "(empty)"
"""What the chat intro says of a trip with no itinerary yet."""

NAMED_LIMIT = 10
"""Documents the name lookup of an ask reads (TRA-186)."""

NAMED_COUNT = 3
"""Most places one ask may name and see offered first (TRA-186)."""

# Activities per part of the day, by pace. The draft is complete on its own:
# every part listed here gets filled when the corpus allows.
PART_PLAN: dict[Pace, dict[DayPart, int]] = {
    "relaxed": {"morning": 1, "afternoon": 1, "evening": 1},
    "balanced": {"morning": 1, "afternoon": 1, "evening": 1, "night": 1},
    "intense": {"morning": 2, "afternoon": 2, "evening": 1, "night": 1},
}

GENERATE_ASKS = frozenset({"generate the trip", "genera el viaje"})
"""What the page's own button sends (`generateMessage` in `i18n/en.ts` and
`es.ts`), matched exactly: it drafts the whole trip with no model step. Any
other wording ("decide tú", "surprise me") is the agent's `plan_for_me`."""
ALTERNATIVES_ASK = re.compile(
    r"^\s*(?:alternatives for day|alternativas para el d[ií]a)\s+(\d+)\s*·\s*(\w+)"
    # What the traveller wants instead, after a colon (TRA-184); absent when
    # the page asks with nothing but the slot.
    r"(?:\s*:\s*(.+))?",
    re.IGNORECASE,
)
PART_WORDS: dict[str, DayPart] = {
    "morning": "morning",
    "mañana": "morning",
    "afternoon": "afternoon",
    "tarde": "afternoon",
    "evening": "evening",
    "atardecer": "evening",
    "night": "night",
    "noche": "night",
}
MONTH_NAMES: dict[str, list[str]] = {
    "en": [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ],
    "es": [
        "enero",
        "febrero",
        "marzo",
        "abril",
        "mayo",
        "junio",
        "julio",
        "agosto",
        "septiembre",
        "octubre",
        "noviembre",
        "diciembre",
    ],
}
OPEN_METEO_HOST = "api.open-meteo.com"
"""Where the forecast comes from, as the trace names it."""

NORMALS_PATTERN = re.compile(r"highs\s+(-?\d+)\s*°C\s+and\s+lows\s+(-?\d+)\s*°C")


# ─── What the model answers (internal, never on the wire) ────────────────────


class BriefUpdate(BaseModel):
    destination: str | None = None
    origin: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    nights: int | None = None
    adults: int | None = None
    children: int | None = None
    budget_tier: Literal[1, 2, 3] | None = None
    interests: list[str] = Field(default_factory=list)
    pace: Pace | None = None


class Pick(BaseModel):
    id: str
    why: str = ""


class Picks(BaseModel):
    picks: list[Pick] = Field(default_factory=list)


class SkeletonDay(BaseModel):
    day: int
    title: str
    districts: list[str] = Field(default_factory=list)
    theme: str = ""


class Skeleton(BaseModel):
    days: list[SkeletonDay] = Field(default_factory=list)


class DayPicks(BaseModel):
    morning: list[Pick] = Field(default_factory=list)
    afternoon: list[Pick] = Field(default_factory=list)
    evening: list[Pick] = Field(default_factory=list)
    night: list[Pick] = Field(default_factory=list)


# ─── Turn context ────────────────────────────────────────────────────────────


@dataclass(slots=True)
class Turn:
    """One request, read once."""

    request: PlannerTurn
    brief: TripBrief
    language: Language
    stay_id: str | None
    used_ids: set[str] = field(default_factory=set)
    used_titles: list[frozenset[str]] = field(default_factory=list)
    # A neighbourhood's borrowed corpus photo, by district, searched once per turn even
    # when several cards ask at the same time (they await the same task).
    corpus_photos: dict[str, asyncio.Task[Photo | None]] = field(default_factory=dict)
    # The request's trace (ADR 0024); records nothing outside a request.
    tracer: TurnTracer = field(default_factory=NullTracer)
    # Told of every phase that is announced: the page's progress (TRA-242).
    on_phase: Callable[[Phase, int | None], None] | None = None

    def phase(
        self, name: Phase, *, announce: bool = True, days: int | None = None
    ) -> None:
        """The steps from here on belong to `name`, in the trace and — unless
        `announce` is false — on the page, as packing the suitcase."""
        self.tracer.phase(name)
        if announce and self.on_phase is not None:
            self.on_phase(name, days)

    def use(self, document: Document) -> None:
        self.used_ids.add(document.id)
        self.used_titles.append(title_words(title_of(document)))

    @property
    def message(self) -> str:
        return (self.request.message or "").strip()

    @property
    def has_days(self) -> bool:
        itinerary = self.request.itinerary
        return itinerary is not None and len(itinerary.days) > 0

    def history(self, limit: int = 12) -> list[Message]:
        return [Message(m.role, m.content) for m in self.request.history[-limit:]]


def _read_turn(request: PlannerTurn) -> Turn:
    brief = request.brief or TripBrief.empty()
    # The traveller's latest words decide against the page's language, never
    # the whole transcript: an early message does not outvote a later switch.
    texts = [m.content for m in request.history if m.role == "user"]
    if request.message:
        texts.append(request.message)
    texts = texts[-RECENT_MESSAGES:]
    used: set[str] = set()
    if request.itinerary is not None:
        if request.itinerary.stay_card_id:
            used.add(request.itinerary.stay_card_id)
        for day in request.itinerary.days:
            for part in DAY_PARTS:
                used.update(getattr(day.slots, part))
    # Cards the traveller has already seen for this ask (TRA-184): they are
    # spent exactly like the ones in the trip, so `_candidates` skips them and
    # `_seed_used_titles` also rules out the same place under another source.
    used.update(request.exclude_card_ids)
    return Turn(
        request=request,
        brief=brief,
        language=detect_language(texts, request.language),
        stay_id=(request.itinerary.stay_card_id if request.itinerary else None),
        used_ids=used,
    )


def city_key(destination: str | None) -> str | None:
    """`Budapest, Hungary` → `budapest`: how the corpus names a city."""
    if not destination:
        return None
    head = destination.split(",")[0].strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", head).strip("-") or None


def fold(text: str) -> str:
    """Lower-case ASCII: `Bolonia, Italia` → `bolonia, italia`."""
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return plain.lower()


def resolve_city(destination: str | None, cities: Sequence[City]) -> City | None:
    """The covered city a traveller means, by any of its spellings.

    Matches a whole alias inside the destination text (`Bolonia`, `bologna,
    Italy`, `Trip to Budapest`), so a model that answers in Spanish and a
    user who types the local name both land on the same corpus.
    """
    if not destination:
        return None
    text = f" {re.sub(r'[^a-z0-9]+', ' ', fold(destination))} "
    for city in cities:
        for alias in (city.slug, fold(city.name), *city.aliases):
            spelled = re.sub(r"[^a-z0-9]+", " ", fold(alias)).strip()
            if spelled and f" {spelled} " in text:
                return city
    return None


def has_image(document: Document) -> bool:
    return '"image_url"' in str(document.metadata.get("extra") or "")


def image_first(documents: Iterable[Document]) -> list[Document]:
    """Stable: pictured places first, the rest in the order they came."""
    return sorted(documents, key=lambda d: not has_image(d))


def is_place(document: Document) -> bool:
    """A card needs a name and a location; section prose has neither."""
    m = document.metadata
    return bool(m.get("name")) and m.get("lat") is not None and m.get("lon") is not None


def _line(document: Document, *, tier: bool = True) -> str:
    m = document.metadata
    summary = " ".join(document.content.split())[:160]
    parts = [document.id, title_of(document), str(m.get("category") or "")]
    parts.append(str(m.get("district") or "-"))
    if tier:
        parts.append(f"tier {m.get('price_tier') or '-'}")
    if has_image(document):
        parts.append("photo")
    parts.append(summary)
    return " | ".join(parts)


_TITLE_NOISE = frozenset(
    {"the", "of", "and", "a", "an", "de", "la", "el", "thermal", "bath", "baths", "spa"}
)


def title_words(title: str) -> frozenset[str]:
    """The words that identify a place: `Rudas Baths` and `Rudas Thermal Bath`
    are the same listing seen by two sources."""
    words = re.findall(r"[a-z0-9áéíóúñüőű]+", title.lower())
    return frozenset(
        w.rstrip("s") for w in words if w not in _TITLE_NOISE
    ) or frozenset(words)


def similar_titles(a: frozenset[str], b: frozenset[str]) -> bool:
    if not a or not b:
        return False
    return len(a & b) / len(a | b) > 0.5


def _dedupe_by_title(
    documents: Iterable[Document], taken: Iterable[frozenset[str]] = ()
) -> list[Document]:
    """One document per place, skipping places already in the trip."""
    seen: list[frozenset[str]] = list(taken)
    unique: list[Document] = []
    for document in documents:
        key = title_words(title_of(document))
        if any(similar_titles(key, other) for other in seen):
            continue
        seen.append(key)
        unique.append(document)
    return unique


def _named_at(
    title: str, *, lowered: str, folded: str, said: frozenset[str]
) -> int | None:
    """Where an answer names this place, or `None` when it does not.

    Either the whole title is in the text — folded, so "Gellert Baths" names
    the "Gellért Baths" — or every word that identifies it is: `title_words`
    drops the noise and the plural, so "the Rudas baths" names the "Rudas
    Thermal Bath" while "the baths" names nothing.
    """
    at = folded.find(fold(title))
    if at >= 0:
        return at
    key = title_words(title)
    if not key or not key <= said:
        return None
    starts = [m.start() for w in key if (m := re.search(rf"\b{re.escape(w)}", lowered))]
    return min(starts) if starts else None


def _places_named_in(text: str, documents: Sequence[Document]) -> list[Document]:
    """The places a text names, in the order it names them."""
    lowered = text.lower()
    folded = fold(text)
    said = title_words(text)
    found: list[tuple[int, Document]] = []
    for document in documents:
        if not is_place(document):
            continue
        at = _named_at(title_of(document), lowered=lowered, folded=folded, said=said)
        if at is not None:
            found.append((at, document))
    found.sort(key=lambda pair: pair[0])
    return [d for _, d in found]


def _keep_known(picks: Sequence[Pick], known: Mapping[str, Document]) -> list[Pick]:
    """Ids the model returned that were retrieved, once each, in its order."""
    kept: list[Pick] = []
    seen: set[str] = set()
    for pick in picks:
        if pick.id in known and pick.id not in seen:
            seen.add(pick.id)
            kept.append(pick)
    return kept


def _unknown(picks: Sequence[Pick], known: Mapping[str, Document]) -> list[str]:
    """Ids the model returned that were never retrieved: dropped, counted."""
    return list(dict.fromkeys(p.id for p in picks if p.id not in known))


def _fill(picks: list[Pick], candidates: Sequence[Document], count: int) -> list[Pick]:
    """Top candidates up to `count` when the model picked too few or unknown ids."""
    chosen = {p.id for p in picks}
    for document in candidates:
        if len(picks) >= count:
            break
        if document.id not in chosen:
            picks.append(Pick(id=document.id))
            chosen.add(document.id)
    return picks[:count]


def _pin_candidates(
    pinned: Sequence[Document], candidates: Sequence[Document]
) -> list[Document]:
    """The places the ask named first, then the search's own, once each.

    A named place the semantic search also returned keeps its pinned position,
    and so does the same place under another source's name.
    """
    if not pinned:
        return list(candidates)
    ids = {d.id for d in pinned}
    keys = [title_words(title_of(d)) for d in pinned]
    rest = [
        d
        for d in candidates
        if d.id not in ids
        and not any(similar_titles(title_words(title_of(d)), key) for key in keys)
    ]
    return [*pinned, *rest]


def _pin_picks(
    pinned: Sequence[Document], picks: Sequence[Pick], count: int
) -> list[Pick]:
    """The named places lead the carousel whatever the model chose (TRA-186).

    The model's own `why` is kept when it picked them too; a named place it
    dropped comes back without one, as `_fill` does for the top candidates.
    """
    if not pinned:
        return list(picks)
    by_id = {p.id: p for p in picks}
    lead = [by_id.get(d.id) or Pick(id=d.id) for d in pinned]
    led = {p.id for p in lead}
    return [*lead, *(p for p in picks if p.id not in led)][:count]


def _brief_json(brief: TripBrief) -> str:
    return brief.model_dump_json(indent=None)


def _merge_brief(brief: TripBrief, update: BriefUpdate) -> TripBrief:
    values = brief.model_dump()
    for name, value in update.model_dump(exclude_none=True).items():
        if name == "interests":
            merged = list(values["interests"])
            merged.extend(tag for tag in value if tag not in merged)
            values["interests"] = merged
        else:
            values[name] = value
    start, end = values["start_date"], values["end_date"]
    if start and end and end >= start:
        values["nights"] = (end - start).days
    return TripBrief.model_validate(values)


def _next_year(day: date) -> date:
    try:
        return day.replace(year=day.year + 1)
    except ValueError:  # 29 February
        return day + timedelta(days=365)


def _ahead(brief: TripBrief, today: date) -> TripBrief:
    """Dates that are still ahead (TRA-244): a trip that starts today or earlier
    is ongoing or over, which core_api locks (ADR 0019) — the planner could
    draft it, but the traveller could never save it. "1 to 3 September" said on
    24 September means next year's, so a start on or before today moves a
    year on, and the end with it, the nights unchanged."""
    start, end = brief.start_date, brief.end_date
    if start is None or start > today:
        return brief
    while start <= today:
        start = _next_year(start)
        end = _next_year(end) if end is not None else None
    return brief.model_copy(update={"start_date": start, "end_date": end})


def _day_count(brief: TripBrief, cap: int) -> int:
    if brief.start_date and brief.end_date and brief.end_date >= brief.start_date:
        return min(cap, (brief.end_date - brief.start_date).days + 1)
    if brief.nights:
        return min(cap, max(1, brief.nights + 1))
    return min(cap, 3)


def _date_of(brief: TripBrief, day: int) -> date | None:
    if brief.start_date is None:
        return None
    return brief.start_date + timedelta(days=day - 1)


@dataclass(frozen=True, slots=True)
class _Finished:
    """The turn's task is over: `error` is what it raised, if anything."""

    error: Exception | None


def _city_name(brief: TripBrief, cities: Sequence[City]) -> str | None:
    """The destination as the progress names it: the covered city, else as typed."""
    city = resolve_city(brief.destination, cities)
    if city is not None:
        return city.name
    return (brief.destination or "").strip() or None


# ─── The use case ────────────────────────────────────────────────────────────


class PlanTrip:
    def __init__(
        self,
        provider: LLMProvider,
        retriever: Retriever,
        *,
        weather: WeatherForecast | None = None,
        photos: PhotoFinder | None = None,
        previews: SitePreviewFinder | None = None,
        cities: Sequence[City],
        max_days: int = 7,
        candidates: int = 8,
        today: Callable[[], date] = date.today,
        agent_max_steps: int = 6,
        agent_max_tool_calls: int = 12,
        guard: InputGuard | None = None,
    ) -> None:
        self._provider = provider
        self._guard: InputGuard = guard if guard is not None else NullInputGuard()
        self._retriever = retriever
        self._weather = weather
        self._photos = photos
        self._previews = previews
        if not cities:
            raise ValueError("PlanTrip needs at least one city")
        self._cities = tuple(cities)
        self._max_days = max_days
        self._candidate_count = candidates
        self._today = today
        self._agent_max_steps = agent_max_steps
        self._agent_max_tool_calls = agent_max_tool_calls

    async def __call__(self, request: PlannerTurn) -> AsyncIterator[PlannerEvent]:
        tracer = current_tracer()
        tracer.phase("open")
        with tracer.sync_span("chain", "read_turn") as span:
            turn = _read_turn(request)
            span.payload["details"] = {
                "language": turn.language,
                "used_ids": len(turn.used_ids),
                "has_stay": turn.stay_id is not None,
            }
        turn.tracer = tracer
        action = request.action
        if isinstance(action, SelectAction):
            events = self._on_select(turn, action)
        elif isinstance(action, RemoveAction):
            events = self._on_remove(turn, action)
        else:
            events = self._guarded(turn)
        try:
            async for event in self._with_progress(turn, events):
                yield event
        finally:
            city = resolve_city(turn.brief.destination, self._cities)
            tracer.city = city.slug if city is not None else tracer.city
            tracer.language = turn.language

    async def _with_progress(
        self, turn: Turn, events: AsyncIterator[PlannerEvent]
    ) -> AsyncIterator[PlannerEvent]:
        """The turn's events with its progress between them (TRA-242).

        A phase starts inside the turn's own code, often right before a model
        call that takes seconds; its `progress` must reach the page then, not
        after. So the turn runs as a task feeding a queue, a phase puts its
        event on the same queue the moment it starts, and this reads the
        queue in order. Closing the stream cancels the task.
        """
        queue: asyncio.Queue[PlannerEvent | _Finished] = asyncio.Queue()
        packing = PackingProgress(
            turn.language,
            turn.brief,
            lambda brief: _city_name(brief, self._cities),
        )

        def announce(step: Phase, days: int | None) -> None:
            event = packing.phase(step, days=days)
            if event is not None:
                queue.put_nowait(event)

        turn.on_phase = announce
        announce("open", None)

        async def run() -> None:
            try:
                async for event in events:
                    for out in packing.around(event):
                        queue.put_nowait(out)
            except Exception as exc:  # re-raised on the reading side
                queue.put_nowait(_Finished(exc))
            else:
                queue.put_nowait(_Finished(None))

        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if isinstance(item, _Finished):
                    if item.error is not None:
                        raise item.error
                    return
                yield item
        finally:
            turn.on_phase = None
            if not task.done():
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    # ── Messages ─────────────────────────────────────────────────────────

    async def _guarded(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """A message reaches a model only past the input guard (TRA-292).

        A stopped message is answered with one fixed sentence and the brief
        as it was; the turn's status stays `ok`. Selections and removals are
        never checked: they carry no traveller text.
        """
        if turn.message:
            async with turn.tracer.span("chain", "guard") as span:
                verdict = await self._guard.check(turn.message)
                span.payload["details"] = {
                    "reason": verdict.reason,
                    "allowed": verdict.allowed,
                    "usage_units": verdict.usage_units,
                }
            if not verdict.allowed:
                # No `zip`: the turn packed nothing and must not read as one
                # that ended well; the page closes its suitcase without the
                # happy banner (plannerReducer, `turn_finished`).
                if turn.request.brief is not None:
                    yield brief_event(turn.brief)
                reason = "other" if verdict.reason == "ok" else verdict.reason
                yield text(planner_text(turn.language, f"guard_{reason}"))
                return
        async for event in self._on_message(turn):
            yield event

    async def _on_message(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """One agent runs the conversation (ADR 0032, TRA-291); what stays
        deterministic is the checklist before it and the page's own asks."""
        if turn.stay_id is None:
            async for event in self._before_stay(turn):
                yield event
            return

        slot, guidance = _alternatives_slot(turn.message)
        if slot is not None:
            # Guided ask: the traveller's own words are the search (TRA-184).
            query = guidance or " ".join(
                [*turn.brief.interests, slot.part or "morning", "things to do"]
            )
            async for event in self._find_options(turn, slot, query):
                yield event
            return

        async for event in self._agent(turn):
            yield event

    async def _agent(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """Kiri answers with tools (ADR 0032): the drafted trip's toolbox
        after the stay (TRA-290), the stay's choice before it (TRA-291)."""
        if not self._provider.supports_tools:
            # Production and the local default call tools: this only guards
            # a misconfigured model.
            turn.phase("zip")
            yield text(planner_text(turn.language, "agent_unavailable"))
            return
        # The agent's modules build on this one's helpers, so they are
        # imported here rather than at the top (an import cycle otherwise).
        from ai_api.application.agent.context import (
            build_context,
            build_pre_stay_context,
        )
        from ai_api.application.agent.loop import run_agent
        from ai_api.application.agent.tools import PRE_STAY_TOOLS, TOOLS, Toolbox

        turn.phase("wardrobe")
        if turn.stay_id is None:
            context = await build_pre_stay_context(turn, self)
            toolbox = Toolbox(context, PRE_STAY_TOOLS)
            template = AGENT_PRE_STAY_PROMPT
        else:
            context = await build_context(turn, self)
            toolbox = Toolbox(context, TOOLS)
            template = AGENT_SYSTEM_PROMPT
        async for event in run_agent(
            turn,
            self._provider,
            toolbox,
            system=context.system,
            messages=context.messages,
            max_steps=self._agent_max_steps,
            max_tool_calls=self._agent_max_tool_calls,
            template=template,
        ):
            yield event
        for event in toolbox.finish():
            yield event

    async def _before_stay(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """The checklist first, then the stay.

        The brief is extracted on every message and goes out as its event,
        whatever comes next; while it lacks something, one question is asked.
        Complete, the page's own "Generate the trip" drafts everything, and
        the first time the neighbourhoods are offered without a model step.
        Once they have been offered (the transcript holds their sentence),
        the agent answers: a question, a step back to the neighbourhoods or
        the hotels, or "decide for me" (TRA-291).
        """
        from ai_api.application.agent.context import neighbourhoods_offered

        brief = await self._extract_brief(turn)
        not_covered: str | None = None
        if brief.destination and resolve_city(brief.destination, self._cities) is None:
            not_covered = planner_text(
                turn.language,
                "not_covered",
                cities=join_names([c.name for c in self._cities], turn.language),
                destination=brief.destination,
            )
            brief = brief.model_copy(update={"destination": None})
        turn.brief = brief
        # The list is written down first, then Kiri says why the destination is
        # not on it (TRA-243): the page packs in the same order either way.
        yield brief_event(brief)
        if not_covered is not None:
            # That sentence already asks for the destination: a model asking
            # again only sees the uncovered city and praises it.
            yield text(not_covered)
            turn.phase("zip")
            return
        if brief.missing():
            async for event in self._ask_missing(turn):
                yield event
            return

        if turn.message.casefold() in GENERATE_ASKS:
            events = self._auto_stay_and_draft(turn)
        elif not neighbourhoods_offered(turn.request.history):
            events = self._neighbourhood_options(turn)
        else:
            events = self._agent(turn)
        async for event in events:
            yield event

    async def _extract_brief(self, turn: Turn) -> TripBrief:
        if not turn.message:
            return _ahead(turn.brief, self._today())
        messages = [
            Message("system", self._persona(turn)),
            Message(
                "system",
                BRIEF_EXTRACTION_PROMPT.format(
                    today=self._today().isoformat(),
                    brief=_brief_json(turn.brief),
                    cities=cities_for_prompt(self._cities),
                ),
            ),
            *turn.history(6),
            Message("user", turn.message),
        ]
        try:
            update = await complete_json(
                self._provider,
                messages,
                BriefUpdate,
                name="extract_brief",
                template=BRIEF_EXTRACTION_PROMPT,
                fallback_on_error=True,
            )
        except DomainError as exc:
            logger.warning("Brief kept as the client sent it: %s", exc.message)
            return _ahead(turn.brief, self._today())
        return _ahead(_merge_brief(turn.brief, update), self._today())

    async def _ask_missing(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        missing = turn.brief.missing()
        messages = [
            Message("system", self._persona(turn)),
            Message(
                "system",
                ASK_MISSING_PROMPT.format(
                    missing=", ".join(missing),
                    first=missing[0],
                    language=LANGUAGE_NAMES[turn.language],
                ),
            ),
            *turn.history(6),
            Message("user", turn.message or "(the user updated the checklist)"),
        ]
        turn.phase("zip")
        async for delta in traced_llm_stream(
            self._provider,
            messages,
            name="ask_missing",
            tracer=turn.tracer,
            template=ASK_MISSING_PROMPT,
        ):
            yield text(delta)

    # ── Neighbourhoods and hotels ────────────────────────────────────────

    async def _neighbourhood_candidates(self, turn: Turn) -> list[Document]:
        query = " ".join(
            ["neighbourhood to stay", *turn.brief.interests, turn.brief.pace or ""]
        )
        turn.phase("wardrobe")
        found = await self._search(
            turn,
            query,
            ("neighbourhood",),
            limit=24,
            districts=(),
            tier=None,
            purpose="neighbourhoods",
        )
        by_district: dict[str, Document] = {}
        for document in found:
            district = document.metadata.get("district")
            if isinstance(district, str) and district not in by_district:
                by_district[district] = document
        return list(by_district.values())

    async def _rank_neighbourhoods(self, turn: Turn) -> list[OptionCard]:
        candidates = await self._neighbourhood_candidates(turn)
        if not candidates:
            return []
        known = {d.id: d for d in candidates}
        prompt = RANK_NEIGHBOURHOODS_PROMPT.format(
            brief=_brief_json(turn.brief),
            city=self._city(turn).name,
            candidates="\n".join(
                f"{d.id} | {title_of(d)} | {' '.join(d.content.split())[:220]}"
                for d in candidates
            ),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        turn.phase("fold")
        picks = await self._pick(
            turn,
            prompt,
            candidates,
            OPTIONS_COUNT,
            name="rank_neighbourhoods",
            template=RANK_NEIGHBOURHOODS_PROMPT,
        )
        turn.phase("weigh")
        return await self._with_photos(
            turn,
            [card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks],
        )

    async def _corpus_photo(self, turn: Turn, card: OptionCard) -> Photo | None:
        """A picture from the corpus for a neighbourhood card that has none of
        its own: a pictured sight of that district, credited as that sight's.

        Only a neighbourhood: a district *is* its landmarks, while a
        restaurant is not another restaurant (TRA-206). A venue the corpus,
        Commons and its own site have no photo of takes the placeholder.
        One search per district per turn.
        """
        if card.category != "neighbourhood" or not card.district:
            return None
        return await self._pictured_place(
            turn,
            f"district:{card.district}",
            f"{card.district} landmark",
            SIGHT_CATEGORIES,
            districts=(card.district,),
        )

    async def _pictured_place(
        self,
        turn: Turn,
        key: str,
        query: str,
        categories: tuple[str, ...],
        *,
        districts: tuple[str, ...] = (),
    ) -> Photo | None:
        if key not in turn.corpus_photos:
            turn.corpus_photos[key] = asyncio.create_task(
                self._find_pictured(turn, key, query, categories, districts)
            )
        return await turn.corpus_photos[key]

    async def _find_pictured(
        self,
        turn: Turn,
        key: str,
        query: str,
        categories: tuple[str, ...],
        districts: tuple[str, ...],
    ) -> Photo | None:
        try:
            found = await self._search(
                turn,
                query,
                categories,
                limit=self._candidate_count,
                districts=districts,
                tier=None,
                purpose="photos",
            )
        except DomainError as exc:
            logger.warning("No corpus photo for %s: %s", key, exc.message)
            return None
        for document in image_first(found):
            pictured = card_from_document(document)
            if pictured.image_url:
                return Photo(
                    url=pictured.image_url,
                    credit=pictured.image_credit
                    or f"{pictured.title} · {pictured.source}",
                )
        return None

    async def _neighbourhood_options(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        cards = await self._rank_neighbourhoods(turn)
        if not cards:
            yield text(planner_text(turn.language, "no_neighbourhoods"))
            return
        turn.phase("zip")
        yield text(planner_text(turn.language, "neighbourhoods"))
        yield options(
            "nb",
            "neighbourhood",
            planner_text(turn.language, "neighbourhoods"),
            cards,
        )

    async def _hotel_candidates(
        self, turn: Turn, district: str | None, *, cheaper: bool
    ) -> tuple[list[Document], str | None]:
        """Stays in the district at the budget, widening when there are few."""
        tier = turn.brief.budget_tier
        if cheaper and tier:
            tier = max(1, tier - 1)
        query = " ".join(["hotel", *turn.brief.interests, district or ""])
        attempts: list[tuple[tuple[str, ...], int | None]] = [
            ((district,) if district else (), tier),
            ((district,) if district else (), None),
            ((), tier),
            ((), None),
        ]
        found: list[Document] = []
        turn.phase("wardrobe")
        for step, (districts, tier_max) in enumerate(attempts):
            found = await self._search(
                turn,
                query,
                STAY_CATEGORIES,
                # Twice as many, because the unpictured ones are dropped next.
                limit=self._candidate_count * 2,
                districts=districts,
                tier=tier_max,
                purpose="hotels",
                ladder_step=step,
            )
            # A stay is always shown with a photo of itself: the corpus
            # resolves one for every hotel it keeps (ADR 0022), so a document
            # without one is stale and is never offered as a place to sleep.
            found = [
                d
                for d in found
                if is_place(d)
                and has_image(d)
                and d.id != turn.stay_id
                and d.id not in turn.used_ids
            ][: self._candidate_count]
            if len(found) >= OPTIONS_COUNT:
                return found, district if districts else None
        return found, None

    async def _hotel_options(
        self, turn: Turn, district: str | None, *, cheaper: bool = False
    ) -> AsyncIterator[PlannerEvent]:
        if district is None and turn.stay_id:
            stay = await self._fetch_one(turn, turn.stay_id)
            if stay is not None:
                district = _district_of(stay)
        candidates, area = await self._hotel_candidates(turn, district, cheaper=cheaper)
        if not candidates:
            yield text(planner_text(turn.language, "no_hotels"))
            return
        known = {d.id: d for d in candidates}
        prompt = PICK_HOTELS_PROMPT.format(
            brief=_brief_json(turn.brief),
            district=area or self._city(turn).name,
            candidates="\n".join(_line(d) for d in candidates),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        turn.phase("fold")
        picks = await self._pick(
            turn,
            prompt,
            candidates,
            OPTIONS_COUNT,
            name="pick_hotels",
            template=PICK_HOTELS_PROMPT,
        )
        turn.phase("weigh")
        cards = await self._with_photos(
            turn,
            [card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks],
        )
        label = area or self._city(turn).name
        turn.phase("zip")
        yield text(planner_text(turn.language, "hotels", district=label))
        yield options(
            f"hotels:{label}",
            "hotel",
            planner_text(turn.language, "hotels", district=label),
            cards,
        )

    async def _auto_stay_and_draft(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """'Choose for me': the best neighbourhood, its best stay, the draft."""
        neighbourhoods = await self._rank_neighbourhoods(turn)
        district = (
            (neighbourhoods[0].district or neighbourhoods[0].title)
            if neighbourhoods
            else None
        )
        candidates, _ = await self._hotel_candidates(turn, district, cheaper=False)
        if not candidates:
            yield text(planner_text(turn.language, "no_hotels"))
            return
        turn.tracer.mark_used([candidates[0].id])
        [stay] = await self._with_photos(turn, [card_from_document(candidates[0])])
        async for event in self._set_stay_and_draft(turn, stay):
            yield event

    async def _set_stay_and_draft(
        self, turn: Turn, stay: OptionCard
    ) -> AsyncIterator[PlannerEvent]:
        turn.stay_id = stay.id
        turn.used_ids.add(stay.id)
        yield patch(set_stay(stay))
        if turn.has_days:
            yield text(planner_text(turn.language, "stay_changed", title=stay.title))
            return
        yield text(planner_text(turn.language, "stay_set", title=stay.title))
        async for event in self._draft(turn, stay):
            yield event

    # ── The draft ────────────────────────────────────────────────────────

    async def _draft(self, turn: Turn, stay: OptionCard) -> AsyncIterator[PlannerEvent]:
        brief = turn.brief
        days = _day_count(brief, self._max_days)
        pace: Pace = brief.pace or "balanced"
        plan = PART_PLAN[pace]

        tracer = turn.tracer
        turn.phase("open")
        with tracer.sync_span("tool", "flights", service="flights") as span:
            route_ops = self._route_ops(brief)
            link = getattr(route_ops[0], "deep_link", None) if route_ops else None
            span.payload.update(
                host=urlparse(link).netloc if link else None,
                status="ok" if route_ops else "empty",
                count=len(route_ops),
            )
        if route_ops:
            yield patch(*route_ops)

        turn.phase("wardrobe")
        weather, skeleton = await asyncio.gather(
            self._weather_by_day(turn, stay, days), self._skeleton(turn, stay, days)
        )

        for day in range(1, days + 1):
            sketch = skeleton.get(day) or SkeletonDay(
                day=day, title=planner_text(turn.language, "day_title", day=day)
            )
            # The title goes out before the searches and the pick, so the page
            # shows the day taking shape and the stream never sits silent long.
            yield patch(set_day_title(day, sketch.title))
            # The trace has a fold and a weigh per day; the page is told the
            # fold once, as the first day starts, and the weigh with the last.
            turn.phase("fold", announce=day == 1, days=days)
            ops = await self._draft_day(
                turn, sketch, days, plan, weather, announce_weigh=day == days
            )
            if ops:
                yield patch(*ops)

        turn.phase("zip")
        yield text(planner_text(turn.language, "draft_done", days=days))

    async def _draft_day(
        self,
        turn: Turn,
        sketch: SkeletonDay,
        days: int,
        plan: Mapping[DayPart, int],
        weather: Mapping[int, DayWeather],
        *,
        announce_weigh: bool = False,
        chosen: list[Document] | None = None,
    ) -> list[Op]:
        """One day of the draft: its picks placed, pictured and checked.

        The ops `_draft` sends for the day after its title — the activities,
        the day's warnings and its weather when `weather` has it — and what
        the agent's `redraft_day` sends after emptying the day (ADR 0032).
        The documents placed are appended to `chosen` when it is given.
        """
        brief = turn.brief
        day = sketch.day
        tracer = turn.tracer
        picks = await self._day_picks(turn, sketch, days, plan)
        turn.phase("weigh", announce=announce_weigh)
        ops: list[Op] = []
        placed: list[Placed] = []
        price_seen = False
        stripped = 0
        slots: list[Slot] = []
        cards: list[OptionCard] = []
        for part in DAY_PARTS:
            for document, why in picks.get(part, []):
                clean, found = strip_prices(why)
                price_seen = price_seen or found
                stripped += int(found)
                slots.append(Slot(day=day, part=part))
                cards.append(card_from_document(document, clean))
                turn.use(document)
                if chosen is not None:
                    chosen.append(document)
        if stripped:
            with tracer.sync_span("chain", "strip_prices") as span:
                span.payload["details"] = {"day": day, "stripped": stripped}
        for slot, card in zip(slots, await self._with_photos(turn, cards), strict=True):
            ops.append(put_activity(slot, card))
            placed.append(Placed(slot=slot, card=card))
        with tracer.sync_span("chain", "validate_day") as span:
            warnings = validate_day(
                day,
                placed,
                pace=brief.pace,
                on=_date_of(brief, day),
                language=turn.language,
            )
            span.payload["details"] = {
                "day": day,
                "warnings": [w.code for w in warnings],
            }
            if warnings:
                span.level = "warning"
        ops.extend(warnings)
        if price_seen:
            ops.append(
                warn(
                    "unverified_price",
                    planner_text(turn.language, "warn_unverified_price"),
                    slot=Slot(day=day, part=None),
                )
            )
        if day in weather:
            w = weather[day]
            ops.append(
                set_weather(
                    day, w.summary, t_max=w.t_max, t_min=w.t_min, source=w.source
                )
            )
        return ops

    def _route_ops(self, brief: TripBrief) -> list[Op]:
        if not brief.origin or not brief.destination:
            return []
        route = route_for(
            brief.origin, brief.destination, brief.start_date, brief.end_date
        )
        return [
            set_route(
                route.origin,
                route.destination,
                outbound_date=brief.start_date,
                return_date=brief.end_date,
                deep_link=route.deep_link,
            )
        ]

    async def _weather_by_day(
        self, turn: Turn, stay: OptionCard, days: int
    ) -> dict[int, DayWeather]:
        brief = turn.brief
        if brief.start_date is None:
            return {}
        end = brief.start_date + timedelta(days=days - 1)
        found: dict[date, DayWeather] = {}
        if self._weather is not None and stay.lat is not None and stay.lon is not None:
            async with turn.tracer.span(
                "tool", "weather", service="open-meteo", host=OPEN_METEO_HOST
            ) as span:
                forecast = await self._weather.daily(
                    stay.lat, stay.lon, brief.start_date, end
                )
                span.payload["status"] = "ok" if forecast else "empty"
                span.payload["count"] = len(forecast)
            for w in forecast:
                found[w.day] = w
        result: dict[int, DayWeather] = {}
        normals: dict[int, DayWeather | None] = {}
        for day in range(1, days + 1):
            on = brief.start_date + timedelta(days=day - 1)
            if on in found:
                result[day] = found[on]
                continue
            if on.month not in normals:
                normals[on.month] = await self._climate_normal(turn, on)
            normal = normals[on.month]
            if normal is not None:
                result[day] = DayWeather(
                    day=on,
                    summary=normal.summary,
                    t_max=normal.t_max,
                    t_min=normal.t_min,
                    source=normal.source,
                )
        return result

    async def _climate_normal(self, turn: Turn, on: date) -> DayWeather | None:
        """The corpus's monthly normal (`om:climate:<city>:<MM>`), if indexed."""
        city = self._city(turn).slug
        try:
            found = await self._fetch(
                turn, [f"om:climate:{city}:{on.month:02d}"], purpose="climate"
            )
        except DomainError as exc:
            logger.warning("Climate normals unavailable: %s", exc.message)
            return None
        if not found:
            return None
        match = NORMALS_PATTERN.search(found[0].content)
        t_max = float(match.group(1)) if match else None
        t_min = float(match.group(2)) if match else None
        month = MONTH_NAMES[turn.language][on.month - 1]
        summary = (
            planner_text(
                turn.language, "weather_normals", month=month, t_max=t_max, t_min=t_min
            )
            if match
            else found[0].content.split(".")[0]
        )
        return DayWeather(
            day=on, summary=summary, t_max=t_max, t_min=t_min, source="climate normals"
        )

    async def _skeleton(
        self, turn: Turn, stay: OptionCard, days: int
    ) -> dict[int, SkeletonDay]:
        districts = await self._neighbourhood_candidates(turn)
        names = {str(d.metadata.get("district")) for d in districts}
        brief = turn.brief
        dates = (
            f"{brief.start_date.isoformat()} to {brief.end_date.isoformat()}"
            if brief.start_date and brief.end_date
            else "dates unknown"
        )
        prompt = SKELETON_PROMPT.format(
            brief=_brief_json(brief),
            stay_district=stay.district or "the centre",
            days=days,
            dates=dates,
            districts="\n".join(
                f"{d.metadata.get('district')} | {' '.join(d.content.split())[:200]}"
                for d in districts
            )
            or "(none listed)",
            language=LANGUAGE_NAMES[turn.language],
        )
        try:
            skeleton = await complete_json(
                self._provider,
                [Message("system", self._persona(turn)), Message("user", prompt)],
                Skeleton,
                name="skeleton",
                template=SKELETON_PROMPT,
                fallback_on_error=True,
            )
        except DomainError as exc:
            logger.warning("Skeleton unavailable, using plain days: %s", exc.message)
            return {}
        result: dict[int, SkeletonDay] = {}
        for sketch in skeleton.days:
            if 1 <= sketch.day <= days and sketch.day not in result:
                sketch.districts = [d for d in sketch.districts if d in names][:2]
                sketch.title = strip_prices(sketch.title)[0][:60] or planner_text(
                    turn.language, "day_title", day=sketch.day
                )
                result[sketch.day] = sketch
        return result

    async def _day_picks(
        self, turn: Turn, sketch: SkeletonDay, days: int, plan: Mapping[DayPart, int]
    ) -> dict[DayPart, list[tuple[Document, str]]]:
        """Candidates per part, one structured pick, unknown ids dropped,
        shortfalls filled with the top candidates so the day is complete."""
        theme = " ".join([sketch.theme, sketch.title, *turn.brief.interests]).strip()

        async def candidates_for(part: DayPart, count: int) -> list[Document]:
            categories, tier = self._part_categories(turn, part)
            if part in ("morning", "afternoon"):
                query = f"{theme} {part}"
            elif part == "evening":
                query = f"dinner restaurant {theme}"
            else:
                query = f"bar evening {theme}"
            found = await self._candidates(
                turn,
                query,
                categories,
                sketch.districts,
                tier,
                purpose=f"candidates:{sketch.day}:{part}",
            )
            return found[: max(self._candidate_count, count)]

        # The four parts are independent searches: in flight together.
        found_per_part = await asyncio.gather(
            *(candidates_for(part, count) for part, count in plan.items())
        )
        candidates: dict[DayPart, list[Document]] = dict(
            zip(plan.keys(), found_per_part, strict=True)
        )

        known = {d.id: d for docs in candidates.values() for d in docs}
        picks_by_part: dict[DayPart, list[Pick]] = {}
        if known:
            on = _date_of(turn.brief, sketch.day)
            prompt = DAY_PICKS_PROMPT.format(
                brief=_brief_json(turn.brief),
                day=sketch.day,
                days=days,
                title=sketch.title,
                theme=sketch.theme or "as the interests say",
                districts=", ".join(sketch.districts) or "anywhere central",
                weekday=on.strftime("%A") if on else "unknown",
                candidates="\n".join(
                    f"[{part}]\n" + "\n".join(_line(d) for d in docs)
                    for part, docs in candidates.items()
                ),
                plan=", ".join(f"{count} for {part}" for part, count in plan.items()),
                language=LANGUAGE_NAMES[turn.language],
            )
            try:
                answer = await complete_json(
                    self._provider,
                    [Message("system", self._persona(turn)), Message("user", prompt)],
                    DayPicks,
                    name=f"day_picks:{sketch.day}",
                    template=DAY_PICKS_PROMPT,
                    fallback_on_error=True,
                )
                dropped: list[str] = []
                for part in plan:
                    allowed = {d.id: d for d in candidates.get(part, [])}
                    returned: list[Pick] = getattr(answer, part)
                    picks_by_part[part] = _keep_known(returned, allowed)
                    dropped.extend(_unknown(returned, allowed))
                turn.tracer.note_picks(
                    [p.id for kept in picks_by_part.values() for p in kept], dropped
                )
            except DomainError as exc:
                logger.warning(
                    "Day %d picked without the model: %s", sketch.day, exc.message
                )

        result: dict[DayPart, list[tuple[Document, str]]] = {}
        chosen: set[str] = set()
        for part, count in plan.items():
            picks = [p for p in picks_by_part.get(part, []) if p.id not in chosen]
            picks = _fill(
                picks,
                [d for d in candidates.get(part, []) if d.id not in chosen],
                count,
            )
            chosen.update(p.id for p in picks)
            result[part] = [(known[p.id], p.why) for p in picks]
        turn.tracer.mark_used(chosen)
        return result

    def _part_categories(
        self, turn: Turn, part: DayPart
    ) -> tuple[tuple[str, ...], int | None]:
        if part == "evening":
            return EAT_CATEGORIES, turn.brief.budget_tier
        if part == "night":
            return DRINK_CATEGORIES, None
        return SIGHT_CATEGORIES, None

    async def _candidates(
        self,
        turn: Turn,
        query: str,
        categories: tuple[str, ...],
        districts: Sequence[str],
        tier: int | None,
        *,
        purpose: str,
    ) -> list[Document]:
        """Places for a part of the day: the day's districts first, then the
        rest of the city (a bath or a market is worth a tram ride), and only
        when that is still short, any price tier."""
        attempts: list[tuple[tuple[str, ...], int | None]] = []
        if districts:
            attempts.append((tuple(districts), tier))
        attempts.append(((), tier))
        if tier is not None:
            attempts.append(((), None))
        collected: list[Document] = []
        seen: set[str] = set()
        wanted = self._candidate_count + OPTIONS_COUNT
        for step, (districts_try, tier_try) in enumerate(attempts):
            if len(collected) >= wanted:
                break
            found = await self._search(
                turn,
                query,
                categories,
                limit=self._candidate_count + len(turn.used_ids),
                districts=districts_try,
                tier=tier_try,
                purpose=purpose,
                ladder_step=step,
            )
            taken = [*turn.used_titles, *(title_words(title_of(d)) for d in collected)]
            for document in _dedupe_by_title(found, taken):
                if document.id in seen or document.id in turn.used_ids:
                    continue
                if is_place(document):
                    seen.add(document.id)
                    collected.append(document)
        return image_first(collected)[:wanted]

    # ── Selections ───────────────────────────────────────────────────────

    async def _on_select(
        self, turn: Turn, action: SelectAction
    ) -> AsyncIterator[PlannerEvent]:
        group = action.group_id
        documents = await self._fetch(turn, action.card_ids, purpose="fetch")
        by_id = {d.id: d for d in documents}
        picked = [by_id[i] for i in action.card_ids if i in by_id]
        turn.tracer.mark_used(d.id for d in picked)
        if not picked:
            yield text(planner_text(turn.language, "stale_group"))
            return

        if group == "nb":
            district = _district_of(picked[0]) or title_of(picked[0])
            async for event in self._hotel_options(turn, district):
                yield event
            return

        if group.startswith("hotels:"):
            [stay] = await self._with_photos(turn, [card_from_document(picked[0])])
            async for event in self._set_stay_and_draft(turn, stay):
                yield event
            return

        # A placed group names its slot in its id; an unplaced `found:` one is
        # placed by the traveller, whose choice travels in the action (TRA-185).
        slot = _slot_of_group(group) or action.slot
        if slot is None:
            yield text(planner_text(turn.language, "stale_group"))
            return
        turn.phase("weigh")
        cards = await self._with_photos(turn, cards_for(picked, {}))
        turn.phase("zip")
        yield patch(*(put_activity(slot, card) for card in cards))
        yield text(
            planner_text(
                turn.language,
                "added",
                titles=", ".join(card.title for card in cards),
                day=slot.day,
            )
        )

    async def _on_remove(
        self, turn: Turn, action: RemoveAction
    ) -> AsyncIterator[PlannerEvent]:
        yield text(planner_text(turn.language, "removed", day=action.slot.day))

    # ── The page's alternatives ──────────────────────────────────────────

    async def _find_options(
        self, turn: Turn, slot: Slot, query: str
    ) -> AsyncIterator[PlannerEvent]:
        """Alternatives for one slot, asked by the page's own "Alternatives for
        day N · part" (`_alternatives_slot`): a `slot:<day>:<part>` group."""
        part: DayPart = slot.part or "morning"
        kind: OptionKind = "restaurant" if part == "evening" else "experience"
        categories, tier = self._part_categories(turn, part)
        await self._seed_used_titles(turn)
        turn.phase("wardrobe")
        pinned = await self._named_places(turn, turn.message or query)
        turn.phase("fold")
        candidates = await self._candidates(
            turn, query, categories, (), tier, purpose=f"candidates:{slot.day}:{part}"
        )
        candidates = _pin_candidates(
            pinned, [d for d in candidates if d.id not in turn.used_ids]
        )
        if not candidates:
            yield text(planner_text(turn.language, "no_options"))
            return
        known = {d.id: d for d in candidates}
        part_name = PART_NAMES[turn.language][part]
        prompt = PICK_OPTIONS_PROMPT.format(
            brief=_brief_json(turn.brief),
            request=query,
            context=f"day {slot.day}, {part_name}",
            candidates="\n".join(_line(d) for d in candidates),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        picks = await self._pick(
            turn,
            prompt,
            candidates,
            OPTIONS_COUNT,
            name="pick_options",
            template=PICK_OPTIONS_PROMPT,
        )
        picks = _pin_picks(pinned, picks, OPTIONS_COUNT)
        turn.tracer.mark_used(p.id for p in picks)
        turn.phase("weigh")
        cards = await self._with_photos(
            turn,
            [card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks],
        )
        prompt_text = planner_text(
            turn.language, "alternatives", day=slot.day, part=part_name
        )
        placed = Slot(day=slot.day, part=part)
        turn.phase("zip")
        yield text(prompt_text)
        yield options(f"slot:{slot.day}:{part}", kind, prompt_text, cards, slot=placed)

    # ── Shared helpers ───────────────────────────────────────────────────

    async def _with_photos(
        self, turn: Turn, cards: list[OptionCard]
    ) -> list[OptionCard]:
        """Every card pictured: its own, one found on Commons, the preview of
        the venue's own site, a sight of the district for a neighbourhood
        card, or the neutral placeholder — never another venue's photo."""
        tally = PhotoTally()
        async with turn.tracer.span("chain", "photos") as span:
            pictured = await ensure_photos(
                cards,
                tally.finder(self._photos),
                city=self._city(turn).name,
                previews=tally.previews(self._previews),
                fallback=lambda card: self._corpus_photo(turn, card),
            )
            span.payload["details"] = tally.sources(cards, pictured)
        return pictured

    def _city(self, turn: Turn) -> City:
        """The city this turn plans: the brief's destination when it is one
        we cover (by any spelling), else the first configured city."""
        return resolve_city(turn.brief.destination, self._cities) or self._cities[0]

    def _persona(self, turn: Turn) -> str:
        return PLANNER_PERSONA.format(language=LANGUAGE_NAMES[turn.language])

    def _clean(self, turn: Turn, why: str) -> str:
        clean, found = strip_prices(why)
        if found:
            with turn.tracer.sync_span("chain", "strip_prices") as span:
                span.payload["details"] = {"stripped": 1}
        return clean

    async def _pick(
        self,
        turn: Turn,
        prompt: str,
        candidates: Sequence[Document],
        count: int,
        *,
        name: str,
        template: str,
    ) -> list[Pick]:
        known = {d.id: d for d in candidates}
        try:
            answer = await complete_json(
                self._provider,
                [Message("system", self._persona(turn)), Message("user", prompt)],
                Picks,
                name=name,
                template=template,
                fallback_on_error=True,
            )
            picks = _keep_known(answer.picks, known)
            turn.tracer.note_picks([p.id for p in picks], _unknown(answer.picks, known))
        except DomainError as exc:
            logger.warning("Picking without the model: %s", exc.message)
            picks = []
        filled = _fill(picks, candidates, count)
        turn.tracer.mark_used(p.id for p in filled)
        return filled

    async def _search(
        self,
        turn: Turn,
        query: str,
        categories: tuple[str, ...],
        *,
        limit: int,
        districts: tuple[str, ...],
        tier: int | None,
        purpose: str,
        ladder_step: int | None = None,
    ) -> list[Document]:
        """One search of the corpus, traced as a `retriever` step with its
        `purpose` (`neighbourhoods`, `candidates:<day>:<part>`, `hotels`,
        `named`, `chat`, `photos`) and the step of a widening ladder."""
        filters = RetrievalFilters(
            city=self._city(turn).slug,
            districts=districts,
            categories=categories,
            price_tier_max=tier,
        )
        asked = query.strip() or "places"
        async with turn.tracer.span(
            "retriever",
            f"search:{purpose}",
            purpose=purpose,
            query=clip_query(asked),
            filters=filters_payload(filters),
            k=limit,
            ladder_step=ladder_step,
        ) as span:
            found = await self._retriever.search(asked, limit=limit, filters=filters)
            turn.tracer.retrieved(span, found)
        return found

    async def _fetch(
        self, turn: Turn, ids: Sequence[str], *, purpose: str
    ) -> list[Document]:
        """Documents by id (a selection, the trip's places, a climate normal),
        traced as a `retriever` step."""
        async with turn.tracer.span(
            "retriever",
            f"fetch:{purpose}",
            purpose=purpose,
            query=clip_query(" ".join(ids)),
            k=len(ids),
        ) as span:
            found = await self._retriever.fetch(ids)
            turn.tracer.retrieved(span, found)
        return found

    async def _named_places(self, turn: Turn, ask: str) -> list[Document]:
        """The places the ask names by their own name, deterministically.

        One search with the traveller's words and no category filter: a place
        the corpus holds is offered because it was named, not because a
        semantic ranking or the model happened to prefer it (TRA-186). Only
        whole names count (`_named_at`), so "goszdu" names nothing while
        "divino" names both DiVino listings; what the trip already holds is
        left out, as everywhere else.
        """
        if not ask.strip():
            return []
        try:
            found = await self._search(
                turn,
                ask,
                (),
                limit=NAMED_LIMIT,
                districts=(),
                tier=None,
                purpose="named",
            )
        except DomainError as exc:
            logger.warning("Looking up the named places failed: %s", exc.message)
            return []
        # A hotel is chosen as a stay, never offered as an activity.
        named = [
            d
            for d in _places_named_in(ask, found)
            if d.id not in turn.used_ids
            and d.metadata.get("category") not in STAY_CATEGORIES
        ]
        return _dedupe_by_title(named, list(turn.used_titles))[:NAMED_COUNT]

    async def _seed_used_titles(self, turn: Turn) -> None:
        """Names of what the trip already holds, so an alternative is never
        the same place under another source's name."""
        if turn.used_titles or not turn.used_ids:
            return
        try:
            held = await self._fetch(turn, sorted(turn.used_ids), purpose="fetch")
        except DomainError as exc:
            logger.warning("Could not read the itinerary's places: %s", exc.message)
            return
        turn.used_titles.extend(title_words(title_of(d)) for d in held)

    async def _fetch_one(self, turn: Turn, doc_id: str) -> Document | None:
        found = await self._fetch(turn, [doc_id], purpose="fetch")
        return found[0] if found else None


# ─── Small pure helpers ──────────────────────────────────────────────────────


def _district_of(document: Document) -> str | None:
    district = document.metadata.get("district")
    return district if isinstance(district, str) and district else None


def _new_found_group() -> str:
    """A carousel of unplaced cards: a fresh id, because the group carries no
    slot to name it by and two asks in one session must not collide."""
    return f"found:{uuid4().hex[:8]}"


def _slot_of_group(group: str) -> Slot | None:
    match = re.fullmatch(r"slot:(\d+):(morning|afternoon|evening|night)", group)
    if match is None:
        return None
    part = cast(DayPart, match.group(2))
    return Slot(day=int(match.group(1)), part=part)


def _alternatives_slot(message: str) -> tuple[Slot | None, str | None]:
    """The slot the page's own 'Alternatives for day N · part' names, and what
    the traveller asked for instead when the ask carried it ('... · afternoon:
    a thermal bath'). `(None, None)` for anything else."""
    match = ALTERNATIVES_ASK.match(message)
    if match is None:
        return None, None
    part = PART_WORDS.get(match.group(2).lower())
    if part is None:
        # A wording this build does not know: the agent reads it.
        return None, None
    guidance = (match.group(3) or "").strip()
    return Slot(day=int(match.group(1)), part=part), guidance or None


def chat_messages(
    language: Language,
    itinerary: str,
    passages: Sequence[Document],
    history: Sequence[Message],
    message: str,
) -> list[Message]:
    """What the model reads to answer a traveller's question: the persona, the
    chat intro with the itinerary so far, the retrieved passages (when there
    are any), the conversation and the question: the grounded answer the
    answer evaluation (`application/answer_eval.py`) measures. The planner
    itself answers through the agent since TRA-291."""
    messages = [
        Message("system", PLANNER_PERSONA.format(language=LANGUAGE_NAMES[language])),
        Message(
            "system",
            CHAT_INTRO.format(language=LANGUAGE_NAMES[language], itinerary=itinerary),
        ),
    ]
    if passages:
        messages.append(
            Message(
                "system", RAG_CONTEXT_PROMPT.format(context=format_context(passages))
            )
        )
    messages.extend(history)
    messages.append(Message("user", message))
    return messages
