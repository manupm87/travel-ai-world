"""What Kiri reads at the start of a turn (ADR 0032, design decision 8).

The itinerary's documents are fetched once (`agent_itinerary`): they render
the trip with titles in the system prompt, seed `AgentContext.known` (so the
write tools can move or remove what the trip holds) and the names the
searches skip. The transcript becomes `AgentMessage`s, in the alternating
order every provider asks for, ending with the traveller's message.
"""

from collections.abc import Sequence
from typing import TYPE_CHECKING

from travel_common.exceptions import DomainError

from ai_api.application.agent.tools import AgentContext, Days
from ai_api.application.cards import title_of
from ai_api.application.plan_trip import Turn, _brief_json, title_words
from ai_api.domain.agent import AgentMessage
from ai_api.domain.models import Document, Message
from ai_api.prompts import AGENT_SYSTEM_PROMPT, LANGUAGE_NAMES
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
