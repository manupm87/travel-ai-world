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
"""

import asyncio
import logging
import re
from collections.abc import AsyncIterator, Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Literal, cast

from pydantic import BaseModel, Field
from travel_common.exceptions import DomainError

from ai_api.application.cards import card_from_document, cards_for, title_of
from ai_api.application.language import Language, detect_language
from ai_api.application.structured import complete_json
from ai_api.application.validate import Placed, strip_prices, validate_day
from ai_api.domain.models import DayWeather, Document, Message, RetrievalFilters
from ai_api.domain.ports import LLMProvider, Retriever, WeatherForecast
from ai_api.infrastructure.static_flight_search import route_for
from ai_api.prompts import (
    ASK_MISSING_PROMPT,
    BRIEF_EXTRACTION_PROMPT,
    CHAT_INTRO,
    DAY_PICKS_PROMPT,
    INTENT_PROMPT,
    LANGUAGE_NAMES,
    PART_NAMES,
    PICK_HOTELS_PROMPT,
    PICK_OPTIONS_PROMPT,
    PLANNER_PERSONA,
    PLANNER_TEXTS,
    RAG_CONTEXT_PROMPT,
    RANK_NEIGHBOURHOODS_PROMPT,
    SKELETON_PROMPT,
    format_context,
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

OPTIONS_COUNT = 3
"""Cards per carousel: enough to choose from, few enough to read."""

# Activities per part of the day, by pace. The draft is complete on its own
# (decision 8): every part listed here gets filled when the corpus allows.
PART_PLAN: dict[Pace, dict[DayPart, int]] = {
    "relaxed": {"morning": 1, "afternoon": 1, "evening": 1},
    "balanced": {"morning": 1, "afternoon": 1, "evening": 1, "night": 1},
    "intense": {"morning": 2, "afternoon": 2, "evening": 1, "night": 1},
}

GENERATE_WORDS = re.compile(
    r"\b(generate|generar|genera|choose for me|elige|decide|sorpr[eé]nd)",
    re.IGNORECASE,
)
ALTERNATIVES_ASK = re.compile(
    r"^\s*(?:alternatives for day|alternativas para el d[ií]a)\s+(\d+)\s*·\s*(\w+)",
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


class Intent(BaseModel):
    intent: Literal["find_options", "change_stay", "chat"] = "chat"
    kind: Literal["experience", "restaurant"] | None = None
    day: int | None = None
    part: DayPart | None = None
    query: str | None = None
    cheaper: bool = False


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
    texts = [m.content for m in request.history if m.role == "user"]
    if request.message:
        texts.append(request.message)
    used: set[str] = set()
    if request.itinerary is not None:
        if request.itinerary.stay_card_id:
            used.add(request.itinerary.stay_card_id)
        for day in request.itinerary.days:
            for part in DAY_PARTS:
                used.update(getattr(day.slots, part))
    return Turn(
        request=request,
        brief=brief,
        language=detect_language(texts),
        stay_id=(request.itinerary.stay_card_id if request.itinerary else None),
        used_ids=used,
    )


def city_key(destination: str | None) -> str | None:
    """`Budapest, Hungary` → `budapest`: how the corpus names a city."""
    if not destination:
        return None
    head = destination.split(",")[0].strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", head).strip("-") or None


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


def _keep_known(picks: Sequence[Pick], known: Mapping[str, Document]) -> list[Pick]:
    """Ids the model returned that were retrieved, once each, in its order."""
    kept: list[Pick] = []
    seen: set[str] = set()
    for pick in picks:
        if pick.id in known and pick.id not in seen:
            seen.add(pick.id)
            kept.append(pick)
    return kept


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


# ─── The use case ────────────────────────────────────────────────────────────


class PlanTrip:
    def __init__(
        self,
        provider: LLMProvider,
        retriever: Retriever,
        *,
        weather: WeatherForecast | None = None,
        cities: Sequence[str] = ("budapest",),
        max_days: int = 7,
        candidates: int = 8,
        today: Callable[[], date] = date.today,
    ) -> None:
        self._provider = provider
        self._retriever = retriever
        self._weather = weather
        self._cities = tuple(c for c in (city_key(city) for city in cities) if c)
        self._max_days = max_days
        self._candidate_count = candidates
        self._today = today

    async def __call__(self, request: PlannerTurn) -> AsyncIterator[PlannerEvent]:
        turn = _read_turn(request)
        action = request.action
        if isinstance(action, SelectAction):
            events = self._on_select(turn, action)
        elif isinstance(action, RemoveAction):
            events = self._on_remove(turn, action)
        else:
            events = self._on_message(turn)
        async for event in events:
            yield event

    # ── Messages ─────────────────────────────────────────────────────────

    async def _on_message(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        if turn.stay_id is None:
            async for event in self._before_stay(turn):
                yield event
            return

        slot = _alternatives_slot(turn.message)
        if slot is not None:
            kind: OptionKind = "restaurant" if slot.part == "evening" else "experience"
            query = " ".join(
                [*turn.brief.interests, slot.part or "morning", "things to do"]
            )
            async for event in self._find_options(
                turn, kind, slot, query, heading="alternatives"
            ):
                yield event
            return

        intent = await self._classify(turn)
        if intent.intent == "find_options":
            kind: OptionKind = intent.kind or "experience"
            part = intent.part or ("evening" if kind == "restaurant" else None)
            slot = Slot(day=max(1, intent.day or 1), part=part)
            async for event in self._find_options(turn, kind, slot, intent.query):
                yield event
        elif intent.intent == "change_stay":
            async for event in self._hotel_options(turn, None, cheaper=intent.cheaper):
                yield event
        else:
            async for event in self._chat(turn):
                yield event

    async def _before_stay(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        """Brief first; then neighbourhoods, or the whole draft on request.

        Once the neighbourhoods have been offered (the transcript holds the
        sentence that introduced them) and the message changes nothing in the
        brief, the user is talking, not answering the checklist: answer as chat
        instead of offering the same carousel again.
        """
        offered = _neighbourhoods_offered(turn)
        if (
            offered
            and not turn.brief.missing()
            and not GENERATE_WORDS.search(turn.message)
        ):
            brief = await self._extract_brief(turn)
            if brief == turn.brief:
                async for event in self._chat(turn):
                    yield event
                return
            turn.brief = brief
        else:
            brief = await self._extract_brief(turn)
        city = city_key(brief.destination)
        if city is not None and city not in self._cities:
            covered = self._cities[0].capitalize()
            yield text(
                planner_text(
                    turn.language,
                    "not_covered",
                    city=covered,
                    destination=brief.destination,
                )
            )
            brief = brief.model_copy(update={"destination": None})
        turn.brief = brief
        yield brief_event(brief)
        if brief.missing():
            async for event in self._ask_missing(turn):
                yield event
            return

        if GENERATE_WORDS.search(turn.message):
            async for event in self._auto_stay_and_draft(turn):
                yield event
            return
        async for event in self._neighbourhood_options(turn):
            yield event

    async def _extract_brief(self, turn: Turn) -> TripBrief:
        if not turn.message:
            return turn.brief
        messages = [
            Message("system", self._persona(turn)),
            Message(
                "system",
                BRIEF_EXTRACTION_PROMPT.format(
                    today=self._today().isoformat(), brief=_brief_json(turn.brief)
                ),
            ),
            *turn.history(6),
            Message("user", turn.message),
        ]
        try:
            update = await complete_json(self._provider, messages, BriefUpdate)
        except DomainError as exc:
            logger.warning("Brief kept as the client sent it: %s", exc.message)
            return turn.brief
        return _merge_brief(turn.brief, update)

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
        async for delta in self._provider.stream(messages):
            yield text(delta)

    # ── Neighbourhoods and hotels ────────────────────────────────────────

    async def _neighbourhood_candidates(self, turn: Turn) -> list[Document]:
        query = " ".join(
            ["neighbourhood to stay", *turn.brief.interests, turn.brief.pace or ""]
        )
        found = await self._search(
            turn, query, ("neighbourhood",), limit=24, districts=(), tier=None
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
            city=(turn.brief.destination or self._cities[0]).title(),
            candidates="\n".join(
                f"{d.id} | {title_of(d)} | {' '.join(d.content.split())[:220]}"
                for d in candidates
            ),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        picks = await self._pick(turn, prompt, candidates, OPTIONS_COUNT)
        return [
            card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks
        ]

    async def _neighbourhood_options(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        cards = await self._rank_neighbourhoods(turn)
        if not cards:
            yield text(planner_text(turn.language, "no_neighbourhoods"))
            return
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
        for districts, tier_max in attempts:
            found = await self._search(
                turn,
                query,
                STAY_CATEGORIES,
                limit=self._candidate_count,
                districts=districts,
                tier=tier_max,
            )
            found = [d for d in found if is_place(d) and d.id != turn.stay_id]
            if len(found) >= OPTIONS_COUNT:
                return found, district if districts else None
        return found, None

    async def _hotel_options(
        self, turn: Turn, district: str | None, *, cheaper: bool = False
    ) -> AsyncIterator[PlannerEvent]:
        if district is None and turn.stay_id:
            stay = await self._fetch_one(turn.stay_id)
            if stay is not None:
                district = _district_of(stay)
        candidates, area = await self._hotel_candidates(turn, district, cheaper=cheaper)
        if not candidates:
            yield text(planner_text(turn.language, "no_hotels"))
            return
        known = {d.id: d for d in candidates}
        prompt = PICK_HOTELS_PROMPT.format(
            brief=_brief_json(turn.brief),
            district=area or (turn.brief.destination or self._cities[0]).title(),
            candidates="\n".join(_line(d) for d in candidates),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        picks = await self._pick(turn, prompt, candidates, OPTIONS_COUNT)
        cards = [
            card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks
        ]
        label = area or (turn.brief.destination or self._cities[0]).title()
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
        stay = card_from_document(candidates[0])
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

        route_ops = self._route_ops(brief)
        if route_ops:
            yield patch(*route_ops)

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
            picks = await self._day_picks(turn, sketch, days, plan)
            ops: list[Op] = []
            placed: list[Placed] = []
            price_seen = False
            for part in DAY_PARTS:
                for document, why in picks.get(part, []):
                    clean, found = strip_prices(why)
                    price_seen = price_seen or found
                    slot = Slot(day=day, part=part)
                    card = card_from_document(document, clean)
                    ops.append(put_activity(slot, card))
                    placed.append(Placed(slot=slot, card=card))
                    turn.use(document)
            ops.extend(
                validate_day(
                    day,
                    placed,
                    pace=pace,
                    on=_date_of(brief, day),
                    language=turn.language,
                )
            )
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
            if ops:
                yield patch(*ops)

        yield text(planner_text(turn.language, "draft_done", days=days))

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
            for w in await self._weather.daily(
                stay.lat, stay.lon, brief.start_date, end
            ):
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
        city = city_key(turn.brief.destination) or self._cities[0]
        try:
            found = await self._retriever.fetch([f"om:climate:{city}:{on.month:02d}"])
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
                turn, query, categories, sketch.districts, tier
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
                )
                for part in plan:
                    allowed = {d.id: d for d in candidates.get(part, [])}
                    picks_by_part[part] = _keep_known(getattr(answer, part), allowed)
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
        for districts_try, tier_try in attempts:
            if len(collected) >= wanted:
                break
            found = await self._search(
                turn,
                query,
                categories,
                limit=self._candidate_count + len(turn.used_ids),
                districts=districts_try,
                tier=tier_try,
            )
            taken = [*turn.used_titles, *(title_words(title_of(d)) for d in collected)]
            for document in _dedupe_by_title(found, taken):
                if document.id in seen or document.id in turn.used_ids:
                    continue
                if is_place(document):
                    seen.add(document.id)
                    collected.append(document)
        return collected[:wanted]

    # ── Selections ───────────────────────────────────────────────────────

    async def _on_select(
        self, turn: Turn, action: SelectAction
    ) -> AsyncIterator[PlannerEvent]:
        group = action.group_id
        documents = await self._retriever.fetch(action.card_ids)
        by_id = {d.id: d for d in documents}
        picked = [by_id[i] for i in action.card_ids if i in by_id]
        if not picked:
            yield text(planner_text(turn.language, "stale_group"))
            return

        if group == "nb":
            district = _district_of(picked[0]) or title_of(picked[0])
            async for event in self._hotel_options(turn, district):
                yield event
            return

        if group.startswith("hotels:"):
            stay = card_from_document(picked[0])
            async for event in self._set_stay_and_draft(turn, stay):
                yield event
            return

        slot = _slot_of_group(group)
        if slot is None:
            yield text(planner_text(turn.language, "stale_group"))
            return
        cards = cards_for(picked, {})
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

    # ── After the draft ──────────────────────────────────────────────────

    async def _classify(self, turn: Turn) -> Intent:
        prompt = INTENT_PROMPT.format(
            city=(turn.brief.destination or self._cities[0]).title(),
            itinerary=_itinerary_summary(turn),
        )
        try:
            return await complete_json(
                self._provider,
                [
                    Message("system", self._persona(turn)),
                    Message("system", prompt),
                    *turn.history(6),
                    Message("user", turn.message),
                ],
                Intent,
            )
        except DomainError as exc:
            logger.warning("Intent unavailable, answering as chat: %s", exc.message)
            return Intent(intent="chat")

    async def _find_options(
        self,
        turn: Turn,
        kind: OptionKind,
        slot: Slot,
        query: str | None,
        *,
        heading: str = "options",
    ) -> AsyncIterator[PlannerEvent]:
        part = slot.part
        if kind == "restaurant" or part == "evening":
            categories, tier = EAT_CATEGORIES, turn.brief.budget_tier
        elif part == "night":
            categories, tier = DRINK_CATEGORIES, None
        else:
            categories, tier = SIGHT_CATEGORIES, None
        request = query or turn.message or " ".join(turn.brief.interests)
        await self._seed_used_titles(turn)
        candidates = await self._candidates(turn, request, categories, (), tier)
        candidates = [d for d in candidates if d.id not in turn.used_ids]
        if not candidates:
            yield text(planner_text(turn.language, "no_options"))
            return
        known = {d.id: d for d in candidates}
        part_name = PART_NAMES[turn.language][part or "morning"]
        context = f"day {slot.day}, {part_name}"
        prompt = PICK_OPTIONS_PROMPT.format(
            brief=_brief_json(turn.brief),
            request=request,
            context=context,
            candidates="\n".join(_line(d) for d in candidates),
            count=OPTIONS_COUNT,
            language=LANGUAGE_NAMES[turn.language],
        )
        picks = await self._pick(turn, prompt, candidates, OPTIONS_COUNT)
        cards = [
            card_from_document(known[p.id], self._clean(turn, p.why)) for p in picks
        ]
        prompt_text = planner_text(turn.language, heading, day=slot.day, part=part_name)
        yield text(prompt_text)
        yield options(
            f"slot:{slot.day}:{part or 'morning'}",
            kind,
            prompt_text,
            cards,
            slot=Slot(day=slot.day, part=part or "morning"),
        )

    async def _chat(self, turn: Turn) -> AsyncIterator[PlannerEvent]:
        messages = [
            Message("system", self._persona(turn)),
            Message(
                "system",
                CHAT_INTRO.format(
                    language=LANGUAGE_NAMES[turn.language],
                    itinerary=_itinerary_summary(turn),
                ),
            ),
        ]
        try:
            passages = await self._search(
                turn, turn.message, (), limit=6, districts=(), tier=None
            )
        except DomainError as exc:
            logger.warning("Answering without retrieval: %s", exc.message)
            passages = []
        if passages:
            messages.append(
                Message(
                    "system",
                    RAG_CONTEXT_PROMPT.format(context=format_context(passages)),
                )
            )
        messages.extend(turn.history())
        messages.append(Message("user", turn.message))
        async for delta in self._provider.stream(messages):
            yield text(delta)

    # ── Shared helpers ───────────────────────────────────────────────────

    def _persona(self, turn: Turn) -> str:
        return PLANNER_PERSONA.format(language=LANGUAGE_NAMES[turn.language])

    def _clean(self, turn: Turn, why: str) -> str:
        return strip_prices(why)[0]

    async def _pick(
        self, turn: Turn, prompt: str, candidates: Sequence[Document], count: int
    ) -> list[Pick]:
        known = {d.id: d for d in candidates}
        try:
            answer = await complete_json(
                self._provider,
                [Message("system", self._persona(turn)), Message("user", prompt)],
                Picks,
            )
            picks = _keep_known(answer.picks, known)
        except DomainError as exc:
            logger.warning("Picking without the model: %s", exc.message)
            picks = []
        return _fill(picks, candidates, count)

    async def _search(
        self,
        turn: Turn,
        query: str,
        categories: tuple[str, ...],
        *,
        limit: int,
        districts: tuple[str, ...],
        tier: int | None,
    ) -> list[Document]:
        filters = RetrievalFilters(
            city=city_key(turn.brief.destination) or self._cities[0],
            districts=districts,
            categories=categories,
            price_tier_max=tier,
        )
        return await self._retriever.search(
            query.strip() or "places", limit=limit, filters=filters
        )

    async def _seed_used_titles(self, turn: Turn) -> None:
        """Names of what the trip already holds, so an alternative is never
        the same place under another source's name."""
        if turn.used_titles or not turn.used_ids:
            return
        try:
            held = await self._retriever.fetch(sorted(turn.used_ids))
        except DomainError as exc:
            logger.warning("Could not read the itinerary's places: %s", exc.message)
            return
        turn.used_titles.extend(title_words(title_of(d)) for d in held)

    async def _fetch_one(self, doc_id: str) -> Document | None:
        found = await self._retriever.fetch([doc_id])
        return found[0] if found else None


# ─── Small pure helpers ──────────────────────────────────────────────────────


def _district_of(document: Document) -> str | None:
    district = document.metadata.get("district")
    return district if isinstance(district, str) and district else None


def _slot_of_group(group: str) -> Slot | None:
    match = re.fullmatch(r"slot:(\d+):(morning|afternoon|evening|night)", group)
    if match is None:
        return None
    part = cast(DayPart, match.group(2))
    return Slot(day=int(match.group(1)), part=part)


def _alternatives_slot(message: str) -> Slot | None:
    """The slot named by the page's own 'Alternatives for day N · part'."""
    match = ALTERNATIVES_ASK.match(message)
    if match is None:
        return None
    part = PART_WORDS.get(match.group(2).lower())
    if part is None:
        return None  # a wording this build does not know: let the model classify
    return Slot(day=int(match.group(1)), part=part)


def _neighbourhoods_offered(turn: Turn) -> bool:
    """Whether an earlier turn introduced the neighbourhood carousel."""
    intros = {texts["neighbourhoods"] for texts in PLANNER_TEXTS.values()}
    return any(
        m.role == "assistant" and any(m.content.startswith(i) for i in intros)
        for m in turn.request.history
    )


def _itinerary_summary(turn: Turn) -> str:
    itinerary = turn.request.itinerary
    if itinerary is None:
        return "(empty)"
    lines = [f"stay: {itinerary.stay_card_id or '-'}"]
    for day in itinerary.days:
        parts = ", ".join(
            f"{part}: {len(getattr(day.slots, part))}"
            for part in DAY_PARTS
            if getattr(day.slots, part)
        )
        lines.append(f"day {day.day}: {parts or 'empty'}")
    return "\n".join(lines)
