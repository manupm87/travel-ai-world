"""Packing the suitcase: the planner's progress, told to the browser (TRA-242).

A planner turn already marks its phases for the trace (`tracer.phase`, ADR
0024). `PackingProgress` turns those marks into `progress` events for the
stream (ADR 0025): the step, one sentence in the traveller's language and the
sources drawn on so far. Steps only move forward — the draft alternates fold
and weigh once per day, and the page must not bounce between them — and the
same step is sent again only when a new source turns up.

It never awaits and never fails: it is told about phases and about the events
on their way out, and hands back what to put on the stream.
"""

from collections.abc import Callable

from ai_api.application.language import Language
from ai_api.prompts import planner_text
from ai_api.schemas.planner_events import (
    PACKING_STEPS,
    BriefEvent,
    ItineraryPatchEvent,
    OptionsEvent,
    PackingStep,
    PlannerEvent,
    ProgressEvent,
    PutActivityOp,
    SetStayOp,
    SetWeatherOp,
    TripBrief,
    progress,
)

CityName = Callable[[TripBrief], str | None]


def _sources_of(event: PlannerEvent) -> list[str]:
    """The corpora an outgoing event shows: its cards' sources, the forecast's."""
    if isinstance(event, OptionsEvent):
        return [card.source for card in event.cards]
    if isinstance(event, ItineraryPatchEvent):
        found: list[str] = []
        for op in event.ops:
            if isinstance(op, SetStayOp | PutActivityOp):
                found.append(op.card.source)
            elif isinstance(op, SetWeatherOp):
                found.append(op.source)
        return found
    return []


class PackingProgress:
    """The progress of one turn: where it is, and what it has drawn on."""

    def __init__(
        self, language: Language, brief: TripBrief, city_name: CityName
    ) -> None:
        self._language = language
        self._brief = brief
        self._city_name = city_name
        self._step: PackingStep | None = None
        self._detail = ""
        self._sources: list[str] = []

    @property
    def step(self) -> PackingStep | None:
        return self._step

    def phase(
        self, step: PackingStep, *, days: int | None = None
    ) -> ProgressEvent | None:
        """The turn starts `step`: its event, or `None` when that is not forward."""
        if self._step is not None and PACKING_STEPS.index(step) <= PACKING_STEPS.index(
            self._step
        ):
            return None
        self._step = step
        self._detail = self._sentence(step, days)
        return progress(step, self._detail, self._sources)

    def around(self, event: PlannerEvent) -> list[PlannerEvent]:
        """What goes on the stream for `event`: the brief is the list being made,
        so `list` comes just before it; a new source is told just after."""
        out: list[PlannerEvent] = []
        if isinstance(event, BriefEvent):
            self._brief = event.brief
            listed = self.phase("list")
            if listed is not None:
                out.append(listed)
        out.append(event)
        fresh = [
            source
            for source in dict.fromkeys(_sources_of(event))
            if source and source not in self._sources
        ]
        if fresh and self._step is not None:
            self._sources.extend(fresh)
            out.append(progress(self._step, self._detail, self._sources))
        return out

    def _sentence(self, step: PackingStep, days: int | None) -> str:
        city = self._city_name(self._brief)
        if step in ("open", "wardrobe") and city:
            return planner_text(self._language, f"progress_{step}_city", city=city)
        if step == "fold" and days:
            return planner_text(self._language, "progress_fold_days", days=days)
        return planner_text(self._language, f"progress_{step}")
