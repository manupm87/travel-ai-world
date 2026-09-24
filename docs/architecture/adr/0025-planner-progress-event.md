# 0025 — The planner streams its progress: a `progress` event per packing step

**Status:** Accepted
**Date:** 2026-09-24

Amends [ADR 0015](0015-planner-sse-v2-stateless-orchestration.md) (the planner's typed stream) and reuses the phases of
[ADR 0024](0024-turn-traces-and-admin-access.md). TRA-242, after the "Pizarra + Kiri" redesign
(TRA-234).

## Context

The redesign tells a planner turn as Kiri packing a suitcase: open it, make the list, look in
the wardrobe, fold and fit, weigh it, zip it up. TRA-239 drew that from the events the stream
already had (`brief`, `options`, `itinerary_patch`, `done`), which could only guess: a draft
sends nothing for the seconds its skeleton call takes, so the page sat on "opening the
suitcase" and then jumped. The trace already knows where a turn is — `PlanTrip` calls
`tracer.phase(...)` before each of its five phases (ADR 0024) — but only the admin console saw it.

## Decision

- The stream gains one event, **`progress`**: `{ "type": "progress", "step", "detail",
  "sources" }`. `step` is `open | list | wardrobe | fold | weigh | zip` — the trace's five phases
  plus `list`, the brief being written down; `detail` is one sentence in the traveller's
  language, built from the turn's own data (the city, the number of days) out of the fixed
  sentences in `prompts.py`; `sources` are the corpora drawn on so far ("Wikivoyage",
  "OpenStreetMap", "Open-Meteo"), read from the cards and the forecast on their way out. As
  every other event, no field is optional on the wire.
- **Steps only move forward.** The draft's per-day fold and weigh are traced per day but told to
  the page once each (`Turn.phase(..., announce=False)`): fold as the first day starts, weigh
  with the last. The same step is sent again only when `sources` grows.
- **It is sent when the step starts, not after.** `PlanTrip` runs the turn as a task that feeds a
  queue; `Turn.phase` puts the step's event on the same queue at once; the stream reads the
  queue in order. Closing the stream cancels the task. `application/progress.py`
  (`PackingProgress`) holds the rules and never awaits or fails.
- The browser takes the server's `progress` as the truth once one arrives (`packing.live`) and
  keeps TRA-239's derivation for a backend that sends none. The recorded demo session adds them
  the way the server would (`withProgress` in `services/plannerDemo.ts`).

## Consequences

- A new event in the union, so `just contracts` regenerates the OpenAPI document and the
  TypeScript; an old frontend ignores it (unknown types are dropped by `parsePlannerEvents`).
- The turn runs in a task: the tracer's context is copied into it, and a cancelled stream marks
  the open spans `cancelled` as before.
- The sentences are fixed and translated, never written by the model: nothing new to trust, and
  no cost.
