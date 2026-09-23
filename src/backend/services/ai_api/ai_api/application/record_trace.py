"""Use case: keep the trace of every streamed turn (ADR 0024).

`RecordTrace` wraps the event stream the endpoint hands to the SSE framer.
Every event is stamped on the tracer's timeline as it passes; when the turn
ends — a `done` event, the end of the stream, an `error` event or a raised
error — the trace is finished and written **before** the closing frame goes
out, because Lambda may freeze the process as soon as the response ends. A
client that goes away mid-stream leaves a `cancelled` trace, best effort.

Recording never breaks a turn: a failed write is logged and the stream goes
on as if nothing happened.
"""

import asyncio
import logging
from collections import Counter
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from contextlib import aclosing

from travel_common.exceptions import DomainError

from ai_api.application.tracing import TurnTracer, activate
from ai_api.domain.models import ThreadSaved
from ai_api.domain.ports import TraceLog
from ai_api.domain.tracing import Status, TurnTrace
from ai_api.schemas.planner_events import (
    BriefEvent,
    DoneEvent,
    ErrorEvent,
    ItineraryPatchEvent,
    OptionsEvent,
    PlannerEvent,
    TextEvent,
)

logger = logging.getLogger(__name__)


class RecordTrace:
    def __init__(self, log: TraceLog) -> None:
        self._log = log

    async def __call__(
        self, tracer: TurnTracer, events: AsyncIterator[PlannerEvent]
    ) -> AsyncIterator[PlannerEvent]:
        """The planner's typed stream, unchanged, with its trace recorded."""
        wrapped = self._wrap(tracer, events, _stamp_planner, _ends_planner)
        async with aclosing(wrapped):
            async for event in wrapped:
                yield event

    async def chat(
        self, tracer: TurnTracer, events: AsyncIterator[str | ThreadSaved]
    ) -> AsyncIterator[str | ThreadSaved]:
        """The chat's stream (text deltas and the recorded thread)."""
        wrapped = self._wrap(tracer, events, _stamp_chat, lambda _: None)
        async with aclosing(wrapped):
            async for event in wrapped:
                yield event

    async def record(
        self, tracer: TurnTracer, status: Status, code: str | None
    ) -> None:
        """Finish and write the trace of a request that does not stream."""
        await self._record(tracer.finish(status, code))

    async def _wrap[E](
        self,
        tracer: TurnTracer,
        events: AsyncIterator[E],
        stamp: Callable[[TurnTracer, E], None],
        ends: Callable[[E], tuple[Status, str | None] | None],
    ) -> AsyncGenerator[E]:
        # The generator runs in the streaming task's context, not the
        # endpoint's: make the tracer current here, before the use case starts.
        activate(tracer)
        finished = False
        try:
            async for event in events:
                stamp(tracer, event)
                end = ends(event)
                if end is not None:
                    finished = True
                    await self._record(tracer.finish(*end))
                yield event
                if finished:
                    return
            finished = True
            await self._record(tracer.finish("ok"))
        except DomainError as exc:
            if not finished:
                finished = True
                tracer.event("error", exc.error_code, 0)
                await self._record(tracer.finish("error", exc.error_code))
            raise
        except Exception:
            if not finished:
                finished = True
                tracer.event("error", "INTERNAL", 0)
                await self._record(tracer.finish("error", "INTERNAL"))
            raise
        finally:
            if not finished:
                # Closed early: the client went away (GeneratorExit or a
                # cancellation). Write what there is, without being cancelled.
                try:
                    await asyncio.shield(self._record(tracer.finish("cancelled")))
                except BaseException:
                    logger.warning("Cancelled turn %s not recorded", tracer.turn_id)

    async def _record(self, trace: TurnTrace) -> None:
        try:
            await self._log.record(trace)
        except Exception:
            logger.exception("Trace of turn %s not recorded", trace.turn_id)


def _ends_planner(event: PlannerEvent) -> tuple[Status, str | None] | None:
    if isinstance(event, DoneEvent):
        return "ok", None
    if isinstance(event, ErrorEvent):
        return "error", event.error_code
    return None


def _stamp_planner(tracer: TurnTracer, event: PlannerEvent) -> None:
    size = len(event.model_dump_json().encode())
    if isinstance(event, TextEvent):
        tracer.answer(event.delta)
        tracer.event("text", "", size)
    elif isinstance(event, BriefEvent):
        tracer.event("brief", f"missing: {','.join(event.missing)}", size)
    elif isinstance(event, OptionsEvent):
        tracer.emitted_group(
            {
                "group_id": event.group_id,
                "kind": event.kind,
                "card_ids": [card.id for card in event.cards],
            }
        )
        tracer.event("options", f"{event.group_id} ×{len(event.cards)}", size)  # noqa: RUF001
    elif isinstance(event, ItineraryPatchEvent):
        ops = [op.model_dump(mode="json") for op in event.ops]
        tracer.emitted_ops(ops)
        counts = Counter(str(op["op"]) for op in ops)
        summary = ", ".join(
            name if n == 1 else f"{name} ×{n}"  # noqa: RUF001
            for name, n in counts.items()
        )
        tracer.event("itinerary_patch", summary, size)
    elif isinstance(event, ErrorEvent):
        tracer.event("error", event.error_code, size)
    else:
        tracer.event("done", "end", size)


def _stamp_chat(tracer: TurnTracer, event: str | ThreadSaved) -> None:
    if isinstance(event, ThreadSaved):
        tracer.event("thread", event.thread_id, len(event.thread_id))
    else:
        tracer.answer(event)
        tracer.event("text", "", len(event.encode()))
