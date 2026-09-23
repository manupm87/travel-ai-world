"""The tracer: what one request did, recorded while it runs (ADR 0024).

The endpoint builds a `TurnTracer`, puts it in the request's context
(`use_tracer`) and wraps the event stream with `RecordTrace`. The use cases
fetch it with `current_tracer()`: outside a request (unit tests, the smoke
session) that is a `NullTracer`, which records nothing, so no caller needs a
fixture or an `if`.

Rules the use cases follow:

- every model call goes through `complete_json(name=...)` or
  `traced_llm_stream(...)`: one `llm` span each, with tokens and timings;
- every search goes through a `retriever` span whose results are recorded
  with `retrieved`, and the ids a pick keeps are marked with `mark_used`;
- `phase` is set before the steps of each of the five phases (`open`,
  `wardrobe`, `fold`, `weigh`, `zip`).
"""

import asyncio
import logging
import time
import uuid
from collections import Counter
from collections.abc import AsyncIterator, Callable, Iterable, Iterator, Sequence
from contextlib import asynccontextmanager, contextmanager, suppress
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from ai_api.application import pricing
from ai_api.domain.models import Document, GenerationParams, Message, Usage
from ai_api.domain.ports import LLMProvider
from ai_api.domain.tracing import (
    MAX_EVENT_MARKS,
    MAX_SOURCES,
    MAX_SPANS,
    PREVIEW_CHARS,
    EventMark,
    Kind,
    Level,
    Phase,
    RetrievedDoc,
    Span,
    SpanKind,
    Status,
    TurnContext,
    TurnTrace,
)
from ai_api.prompts import prompt_version

logger = logging.getLogger(__name__)

DEFAULT_PAYLOAD_BYTES = 8192
"""Longest text a payload field keeps (`TRACE_PAYLOAD_BYTES`)."""

VALIDATION_ERROR_CHARS = 500
QUERY_CHARS = 500
MAX_CONTEXT_OPS = 200


def clip(text: str | None, limit: int = DEFAULT_PAYLOAD_BYTES) -> tuple[str, bool]:
    """`text` cut to `limit` UTF-8 bytes on a character boundary, and whether
    anything was cut."""
    if not text:
        return "", False
    encoded = text.encode()
    if len(encoded) <= limit:
        return text, False
    return encoded[:limit].decode(errors="ignore"), True


def _payload_defaults(kind: SpanKind) -> dict[str, Any]:
    """Every key a span of this kind carries, `None` until known."""
    if kind == "llm":
        return {
            "provider": None,
            "model": None,
            "operation": None,
            "schema": None,
            "prompt_version": None,
            "temperature": None,
            "max_tokens": None,
            "input_tokens": None,
            "output_tokens": None,
            "ttfc_ms": None,
            "attempts": None,
            "repaired": False,
            "validation_error": None,
            "picked_ids": [],
            "dropped_ids": [],
            "input": None,
            "output": None,
            "input_truncated": False,
            "output_truncated": False,
        }
    if kind == "retriever":
        return {
            "purpose": None,
            "query": None,
            "filters": None,
            "k": None,
            "ladder_step": None,
            "embedding_model": None,
            "embed_tokens": None,
            "n_results": None,
            "no_hit": None,
        }
    if kind == "tool":
        return {"service": None, "host": None, "status": None, "count": None}
    return {"details": {}}


_active_span: ContextVar[tuple[int, int] | None] = ContextVar(
    "ai_api_active_span", default=None
)
"""`(id(tracer), seq)` of the span a block runs in: how nesting is found,
across `asyncio.gather` too (a task copies the context it was created in)."""


class TurnTracer:
    """Collects the spans, the SSE timeline and the counters of one request."""

    enabled = True

    def __init__(
        self,
        kind: Kind,
        route: str,
        subject: str,
        *,
        clock: Callable[[], float] = time.perf_counter,
        payload_bytes: int = DEFAULT_PAYLOAD_BYTES,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self.kind: Kind = kind
        self.route = route
        self.subject = subject
        self.turn_id = uuid.uuid4().hex
        self.ts = now()
        self._clock = clock
        self._started = clock()
        self.payload_bytes = payload_bytes
        # Request attributes the endpoint sets.
        self.session_id: str | None = None
        self.trip_id: str | None = None
        self.city: str | None = None
        self.language: str | None = None
        self.action: str | None = None
        self.embedding_model: str | None = None
        self.params: GenerationParams | None = None
        # What the request carried and what the answer said.
        self.context = TurnContext(
            message=None,
            action=None,
            brief=None,
            itinerary_ids=[],
            exclude_card_ids=[],
            history=[],
            answer_text="",
            ops=[],
            option_groups=[],
        )
        self._answer: list[str] = []
        self._phase: Phase = "open"
        self._seq = 0
        self.spans: list[Span] = []
        self.timeline: list[EventMark] = []
        self.sources: list[RetrievedDoc] = []
        self._used: set[str] = set()
        self.truncated = False
        self._first_event_ms: int | None = None
        self.events: Counter[str] = Counter()
        self.ops: Counter[str] = Counter()
        # Counters updated as spans close (so a span past the cap still counts).
        self.llm_calls = 0
        self.retrievals = 0
        self.docs_retrieved = 0
        self.repairs = 0
        self.dropped_ids = 0
        self.prices_stripped = 0
        self.warnings = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.embed_tokens = 0
        self.model: str | None = None
        self.provider: str | None = None
        self.prompt_version: str | None = None
        self._last_llm: Span | None = None

    # ── Clock ────────────────────────────────────────────────────────────

    def elapsed_ms(self) -> int:
        return round((self._clock() - self._started) * 1000)

    def clip(self, text: str | None) -> tuple[str, bool]:
        return clip(text, self.payload_bytes)

    # ── Steps ────────────────────────────────────────────────────────────

    def phase(self, name: Phase) -> None:
        """Spans opened from now on belong to `name`."""
        self._phase = name

    @asynccontextmanager
    async def span(
        self, kind: SpanKind, name: str, **payload: Any
    ) -> AsyncIterator[Span]:
        """One step. Its parent is the span the caller runs in; its duration
        is the block's; an exception marks it `error` and propagates."""
        span = self._open(kind, name, payload)
        token = _active_span.set((id(self), span.seq))
        try:
            yield span
        except (GeneratorExit, asyncio.CancelledError):
            span.level = "warning"
            span.message = "cancelled"
            raise
        except BaseException as exc:
            span.level = "error"
            span.message = f"{type(exc).__name__}: {exc}"[:VALIDATION_ERROR_CHARS]
            raise
        finally:
            # A stream closed by the event loop's finaliser runs in another
            # context, where the token cannot be reset (nor needs to be).
            with suppress(ValueError):
                _active_span.reset(token)
            self._close(span)

    @contextmanager
    def sync_span(self, kind: SpanKind, name: str, **payload: Any) -> Iterator[Span]:
        """`span` for a step with nothing to await (a validation, a tally)."""
        span = self._open(kind, name, payload)
        try:
            yield span
        finally:
            self._close(span)

    def _open(self, kind: SpanKind, name: str, payload: dict[str, Any]) -> Span:
        self._seq += 1
        active = _active_span.get()
        parent = active[1] if active is not None and active[0] == id(self) else None
        span = Span(
            seq=self._seq,
            parent_seq=parent,
            kind=kind,
            name=name,
            phase=self._phase,
            t0_ms=self.elapsed_ms(),
            payload={**_payload_defaults(kind), **payload},
        )
        if kind == "llm":
            self._last_llm = span
        if not self.enabled:
            return span
        if len(self.spans) < MAX_SPANS:
            self.spans.append(span)
        else:
            self.truncated = True
        return span

    def _close(self, span: Span) -> None:
        span.dur_ms = self.elapsed_ms() - span.t0_ms
        if not self.enabled:
            return
        payload = span.payload
        if span.kind == "llm":
            self.llm_calls += 1
            self.input_tokens += payload.get("input_tokens") or 0
            self.output_tokens += payload.get("output_tokens") or 0
            self.repairs += 1 if payload.get("repaired") else 0
            self.model = payload.get("model") or self.model
            self.provider = payload.get("provider") or self.provider
            self.prompt_version = payload.get("prompt_version") or self.prompt_version
        elif span.kind == "retriever":
            self.retrievals += 1
            self.docs_retrieved += payload.get("n_results") or 0
            self.embed_tokens += payload.get("embed_tokens") or 0
            if payload.get("embedding_model") is None:
                payload["embedding_model"] = self.embedding_model
        elif span.kind == "chain":
            details = payload.get("details") or {}
            self.prices_stripped += int(details.get("stripped") or 0)
            self.warnings += len(details.get("warnings") or [])

    def retrieved(self, span: Span, documents: Sequence[Document]) -> None:
        """Record what a retrieval returned, in rank order."""
        span.payload["n_results"] = len(documents)
        span.payload["no_hit"] = not documents
        results = [_retrieved_doc(d, rank) for rank, d in enumerate(documents, 1)]
        span.results = results
        if not self.enabled:
            return
        for result in results:
            if len(self.sources) >= MAX_SOURCES:
                self.truncated = True
                break
            self.sources.append(
                RetrievedDoc(
                    doc_id=result.doc_id,
                    title=result.title,
                    category=result.category,
                    district=result.district,
                    distance=result.distance,
                    rank=result.rank,
                    used=result.doc_id in self._used,
                )
            )

    def mark_used(self, ids: Iterable[str]) -> None:
        """These documents made it into the answer: marked on every retrieval
        that returned them. `docs_used` counts each id once."""
        if not self.enabled:
            return
        wanted = set(ids)
        if not wanted:
            return
        found: set[str] = set()
        for span in self.spans:
            for result in span.results:
                if result.doc_id in wanted:
                    result.used = True
                    found.add(result.doc_id)
        for source in self.sources:
            if source.doc_id in wanted:
                source.used = True
                found.add(source.doc_id)
        self._used.update(found)

    def note_picks(self, picked: Sequence[str], dropped: Sequence[str]) -> None:
        """What the last model call chose: the ids kept (marked used) and the
        ids it returned that were never retrieved (dropped, counted)."""
        span = self._last_llm
        if span is not None:
            span.payload["picked_ids"] = list(picked)
            span.payload["dropped_ids"] = list(dropped)
        if self.enabled:
            self.dropped_ids += len(dropped)
        self.mark_used(picked)

    # ── The request and the answer ───────────────────────────────────────

    def set_request(
        self,
        *,
        message: str | None,
        action: dict[str, Any] | None = None,
        brief: dict[str, Any] | None = None,
        itinerary_ids: Sequence[str] = (),
        exclude_card_ids: Sequence[str] = (),
        history: Sequence[tuple[str, str]] = (),
    ) -> None:
        """What the request carried, truncated to the payload cap."""
        text, cut = self.clip(message)
        kept: list[dict[str, str]] = []
        budget = self.payload_bytes
        for role, content in reversed(history):
            size = len(content.encode())
            if size > budget:
                cut = True
                break
            budget -= size
            kept.append({"role": role, "content": content})
        kept.reverse()
        if len(kept) < len(history):
            cut = True
        self.context.message = text if message is not None else None
        self.context.action = action
        self.context.brief = brief
        self.context.itinerary_ids = list(itinerary_ids)
        self.context.exclude_card_ids = list(exclude_card_ids)
        self.context.history = kept
        self.context.truncated = self.context.truncated or cut

    def answer(self, delta: str) -> None:
        """A piece of the text the client was sent."""
        if self.enabled:
            self._answer.append(delta)

    def emitted_ops(self, ops: Iterable[dict[str, Any]]) -> None:
        """Itinerary ops the client was sent (compact: cards by id and title)."""
        if not self.enabled:
            return
        for op in ops:
            name = str(op.get("op"))
            self.ops[name] += 1
            if len(self.context.ops) >= MAX_CONTEXT_OPS:
                self.context.truncated = True
                continue
            self.context.ops.append(_compact_op(op))

    def emitted_group(self, group: dict[str, Any]) -> None:
        if self.enabled:
            self.context.option_groups.append(group)

    def event(self, type: str, summary: str, bytes: int) -> None:
        """One SSE event as it left; consecutive `text` deltas collapse."""
        if not self.enabled:
            return
        at = self.elapsed_ms()
        if self._first_event_ms is None:
            self._first_event_ms = at
        self.events[type] += 1
        last = self.timeline[-1] if self.timeline else None
        if type == "text" and last is not None and last.type == "text":
            last.count += 1
            last.bytes += bytes
            return
        if len(self.timeline) >= MAX_EVENT_MARKS:
            self.truncated = True
            return
        self.timeline.append(
            EventMark(t_ms=at, type=type, summary=summary, bytes=bytes)
        )

    # ── The end ──────────────────────────────────────────────────────────

    def finish(self, status: Status, error_code: str | None = None) -> TurnTrace:
        answer, cut = self.clip("".join(self._answer))
        self.context.answer_text = answer
        self.context.truncated = self.context.truncated or cut
        question = self.context.message or self.action or ""
        return TurnTrace(
            turn_id=self.turn_id,
            ts=self.ts,
            kind=self.kind,
            route=self.route,
            subject=self.subject,
            session_id=self.session_id,
            trip_id=self.trip_id,
            city=self.city,
            language=self.language,
            action=self.action,
            model=self.model,
            provider=self.provider,
            prompt_version=self.prompt_version,
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            embed_tokens=self.embed_tokens,
            cost_usd=pricing.estimate(
                self.model,
                self.input_tokens,
                self.output_tokens,
                self.embedding_model,
                self.embed_tokens,
            ),
            pricing_version=pricing.PRICING_VERSION,
            latency_ms=self.elapsed_ms(),
            first_event_ms=self._first_event_ms,
            status=status,
            error_code=error_code,
            llm_calls=self.llm_calls,
            retrievals=self.retrievals,
            docs_retrieved=self.docs_retrieved,
            docs_used=len(self._used),
            repairs=self.repairs,
            dropped_ids=self.dropped_ids,
            prices_stripped=self.prices_stripped,
            warnings=self.warnings,
            events=dict(self.events),
            ops=dict(self.ops),
            sources=list(self.sources),
            question_preview=question[:PREVIEW_CHARS],
            answer_preview=answer[:PREVIEW_CHARS],
            truncated=self.truncated,
            spans=list(self.spans),
            timeline=list(self.timeline),
            context=self.context,
        )


class NullTracer(TurnTracer):
    """The tracer outside a request: same API, records nothing."""

    enabled = False

    def __init__(self) -> None:
        super().__init__("planner", "", "")


_current: ContextVar[TurnTracer | None] = ContextVar("ai_api_tracer", default=None)


def current_tracer() -> TurnTracer:
    """The request's tracer, or a `NullTracer` outside one."""
    return _current.get() or NullTracer()


@contextmanager
def use_tracer(tracer: TurnTracer) -> Iterator[TurnTracer]:
    """Make `tracer` the current one for the block (the endpoint's request)."""
    token = _current.set(tracer)
    try:
        yield tracer
    finally:
        _current.reset(token)


def activate(tracer: TurnTracer) -> None:
    """Make `tracer` current in this context for good: what a stream's own
    generator calls first, since it runs in a context of its own."""
    _current.set(tracer)


# ─── Model calls ────────────────────────────────────────────────────────────


def llm_payload(
    tracer: TurnTracer,
    provider: LLMProvider,
    messages: Sequence[Message],
    *,
    operation: str,
    template: str | None,
) -> dict[str, Any]:
    """What an `llm` span knows before the call."""
    last_user = next((m.content for m in reversed(messages) if m.role == "user"), "")
    text, cut = tracer.clip(last_user)
    params = tracer.params
    return {
        "provider": getattr(provider, "name", None),
        "operation": operation,
        "prompt_version": prompt_version(template) if template else None,
        "temperature": params.temperature if params else None,
        "max_tokens": params.max_tokens if params else None,
        "input": text,
        "input_truncated": cut,
    }


def fill_usage(span: Span, usage: Usage) -> None:
    span.payload["model"] = usage.model
    span.payload["input_tokens"] = usage.input_tokens
    span.payload["output_tokens"] = usage.output_tokens


async def traced_llm_stream(
    provider: LLMProvider,
    messages: Sequence[Message],
    *,
    name: str,
    tracer: TurnTracer | None = None,
    template: str | None = None,
    usage: Usage | None = None,
) -> AsyncIterator[str]:
    """`provider.stream` inside an `llm` span: tokens, time to first chunk,
    the output (truncated)."""
    tracer = tracer or current_tracer()
    usage = usage if usage is not None else Usage()
    payload = llm_payload(
        tracer, provider, messages, operation="chat", template=template
    )
    async with tracer.span("llm", name, **payload) as span:
        span.payload["attempts"] = 1
        parts: list[str] = []
        try:
            async for delta in provider.stream(messages, usage=usage):
                if not parts:
                    span.payload["ttfc_ms"] = tracer.elapsed_ms() - span.t0_ms
                parts.append(delta)
                yield delta
        finally:
            fill_usage(span, usage)
            output, cut = tracer.clip("".join(parts))
            span.payload["output"] = output
            span.payload["output_truncated"] = cut


async def traced_complete(
    provider: LLMProvider,
    messages: Sequence[Message],
    *,
    name: str,
    tracer: TurnTracer | None = None,
    template: str | None = None,
    usage: Usage | None = None,
) -> str:
    """`provider.complete` inside an `llm` span (a whole answer, not streamed)."""
    tracer = tracer or current_tracer()
    usage = usage if usage is not None else Usage()
    payload = llm_payload(
        tracer, provider, messages, operation="chat", template=template
    )
    async with tracer.span("llm", name, **payload) as span:
        span.payload["attempts"] = 1
        answer = await provider.complete(messages, usage=usage)
        fill_usage(span, usage)
        span.payload["output"], span.payload["output_truncated"] = tracer.clip(answer)
        return answer


# ─── Small helpers ──────────────────────────────────────────────────────────


def filters_payload(filters: Any) -> dict[str, Any] | None:
    """A `RetrievalFilters` as a plain dict (lists, not tuples)."""
    if filters is None:
        return None
    return {
        "city": filters.city,
        "districts": list(filters.districts),
        "categories": list(filters.categories),
        "kinds": list(filters.kinds),
        "price_tier_max": filters.price_tier_max,
        "bbox": list(filters.bbox) if filters.bbox is not None else None,
    }


def clip_query(query: str) -> str:
    return query[:QUERY_CHARS]


def _retrieved_doc(document: Document, rank: int) -> RetrievedDoc:
    m = document.metadata
    title = m.get("name") or m.get("heading_path")
    distance = m.get("distance")
    return RetrievedDoc(
        doc_id=document.id,
        title=str(title) if title else None,
        category=_text(m.get("category")),
        district=_text(m.get("district")),
        distance=float(distance) if isinstance(distance, int | float) else None,
        rank=rank,
    )


def _text(value: object) -> str | None:
    return str(value) if value not in (None, "") else None


def _compact_op(op: dict[str, Any]) -> dict[str, Any]:
    compact = {key: value for key, value in op.items() if key != "card"}
    card = op.get("card")
    if isinstance(card, dict):
        compact["card"] = {"id": card.get("id"), "title": card.get("title")}
    return compact


def level_for(warned: bool) -> Level:
    return "warning" if warned else "default"
