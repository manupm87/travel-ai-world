"""What Kiri reads at the start of a turn (ADR 0032, design decision 8).

The itinerary's documents are fetched once (`agent_itinerary`): they render
the trip with titles in the system prompt, seed `AgentContext.known` (so the
write tools can move or remove what the trip holds) and the names the
searches skip. The transcript becomes `AgentMessage`s, in the alternating
order every provider asks for, ending with the traveller's message.

Before the stay (TRA-291) there is no itinerary: the context is the brief and
what the transcript says of the offers so far. The server keeps no state and
the page sends text only (`PlannerTurn.history`), so whether the
neighbourhoods were offered and which district the hotels were offered for
are read from the fixed sentences that introduced them, in either language,
anywhere in an assistant message (agent prose may come first). They are
context — the first offer and `offer_hotels` without a district — never a
route.
"""

import re
from collections.abc import Iterable, Sequence
from typing import TYPE_CHECKING, Protocol

from travel_common.exceptions import DomainError

from ai_api.application.agent.tools import AgentContext, Days
from ai_api.application.cards import title_of
from ai_api.application.plan_trip import Turn, _brief_json, title_words
from ai_api.domain.agent import AgentMessage
from ai_api.domain.models import Document, Message
from ai_api.prompts import (
    AGENT_PRE_STAY_PROMPT,
    AGENT_SYSTEM_PROMPT,
    LANGUAGE_NAMES,
    PLANNER_TEXTS,
)
from ai_api.schemas.planner_events import DAY_PARTS

if TYPE_CHECKING:
    from ai_api.application.plan_trip import PlanTrip

HISTORY_MESSAGES = 12
"""Text turns of the transcript the agent reads, as `_chat` does."""


async def build_context(turn: Turn, planner: "PlanTrip") -> AgentContext:
    days = snapshot_days(turn)
    stay_id = turn.stay_id
    ids = sorted({i for parts in days.values() for ids in parts.values() for i in ids})
    if stay_id:
        ids = [stay_id, *ids]
    documents: list[Document] = []
    if ids:
        try:
            documents = await planner._fetch(turn, ids, purpose="agent_itinerary")
        except DomainError:
            documents = []
    known = {d.id: d for d in documents}
    if not turn.used_titles:
        turn.used_titles.extend(title_words(title_of(d)) for d in documents)
    context = AgentContext(
        turn=turn, planner=planner, known=known, days=days, stay_id=stay_id
    )
    context.system = [system_prompt(turn, planner, days, known)]
    context.messages = transcript(turn.history(HISTORY_MESSAGES), turn.message)
    return context


async def build_pre_stay_context(turn: Turn, planner: "PlanTrip") -> AgentContext:
    """Before the stay: no itinerary, the brief and the last hotels' district."""
    hotels = last_hotels_district(turn.request.history)
    context = AgentContext(
        turn=turn,
        planner=planner,
        known={},
        days={},
        stay_id=None,
        hotels_district=hotels,
    )
    context.system = [
        AGENT_PRE_STAY_PROMPT.format(
            language=LANGUAGE_NAMES[turn.language],
            today=planner._today().isoformat(),
            city=planner._city(turn).name,
            brief=_brief_json(turn.brief),
            hotels=hotels or "(no hotels offered yet)",
        )
    ]
    context.messages = transcript(turn.history(HISTORY_MESSAGES), turn.message)
    return context


class Said(Protocol):
    """A transcript entry: `Message` or the request's `ChatMessage`."""

    @property
    def role(self) -> str: ...

    @property
    def content(self) -> str: ...


def _sentence(template: str) -> re.Pattern[str]:
    """A `PLANNER_TEXTS` sentence as a pattern; its one `{field}`, if any,
    becomes the group `value` (one line, as short as it can be)."""
    head, brace, rest = template.partition("{")
    if not brace:
        return re.compile(re.escape(template))
    _, _, tail = rest.partition("}")
    return re.compile(re.escape(head) + r"(?P<value>[^\n]+?)" + re.escape(tail))


_NEIGHBOURHOODS = [_sentence(t["neighbourhoods"]) for t in PLANNER_TEXTS.values()]
_HOTELS = [_sentence(t["hotels"]) for t in PLANNER_TEXTS.values()]


def neighbourhoods_offered(history: Iterable[Said]) -> bool:
    """Whether an assistant message introduced the neighbourhoods."""
    return any(
        m.role == "assistant" and any(p.search(m.content) for p in _NEIGHBOURHOODS)
        for m in history
    )


def last_hotels_district(history: Sequence[Said]) -> str | None:
    """The district the latest hotel carousel was offered for, from the
    sentence that introduced it; `None` when no hotels were offered."""
    for message in reversed(history):
        if message.role != "assistant":
            continue
        found = [m for p in _HOTELS for m in p.finditer(message.content)]
        if found:
            latest = max(found, key=lambda m: m.start())
            return latest.group("value").strip() or None
    return None


def snapshot_days(turn: Turn) -> Days:
    """The snapshot's days as a mutable copy, every part present."""
    itinerary = turn.request.itinerary
    days: Days = {}
    if itinerary is None:
        return days
    for day in itinerary.days:
        days[day.day] = {part: list(getattr(day.slots, part)) for part in DAY_PARTS}
    return days


def _label(document: Document | None, doc_id: str) -> str:
    if document is None:
        return f"[{doc_id}] (not in the guide)"
    m = document.metadata
    where = ", ".join(str(v) for v in (m.get("category"), m.get("district")) if v)
    return f"[{doc_id}] {title_of(document)}" + (f" ({where})" if where else "")


def itinerary_lines(days: Days, known: dict[str, Document]) -> str:
    """`day 2 · afternoon · [id] Rudas Baths (do, Tabán)`, one per activity."""
    lines: list[str] = []
    for day in sorted(days):
        items = [
            f"day {day} · {part} · {_label(known.get(i), i)}"
            for part in DAY_PARTS
            for i in days[day][part]
        ]
        lines.extend(items or [f"day {day} · (empty)"])
    return "\n".join(lines) or "(no days)"


def system_prompt(
    turn: Turn, planner: "PlanTrip", days: Days, known: dict[str, Document]
) -> str:
    stay = _label(known.get(turn.stay_id), turn.stay_id) if turn.stay_id else "(none)"
    return AGENT_SYSTEM_PROMPT.format(
        language=LANGUAGE_NAMES[turn.language],
        today=planner._today().isoformat(),
        days=len(days),
        city=planner._city(turn).name,
        brief=_brief_json(turn.brief),
        stay=stay,
        itinerary=itinerary_lines(days, known),
    )


def transcript(history: Sequence[Message], message: str) -> list[AgentMessage]:
    """The text turns as alternating `AgentMessage`s that start and end with
    the traveller: consecutive turns of one role are joined, a leading
    assistant turn is dropped, and the message closes the list."""
    merged: list[tuple[str, str]] = []
    for m in [*history, Message("user", message)]:
        content = m.content.strip()
        if m.role not in ("user", "assistant") or not content:
            continue
        if merged and merged[-1][0] == m.role:
            merged[-1] = (m.role, f"{merged[-1][1]}\n\n{content}")
        else:
            merged.append((m.role, content))
    while merged and merged[0][0] != "user":
        merged.pop(0)
    if not merged or merged[-1][0] != "user":
        merged.append(("user", message.strip() or "(no message)"))
    return [
        AgentMessage(role="user" if role == "user" else "assistant", text=content)
        for role, content in merged
    ]
