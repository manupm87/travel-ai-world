# 0015 — The planner streams typed events (SSE v2) from a stateless orchestrator in `ai_api`

**Status:** Accepted
**Date:** 2026-09-18

## Context

The planner page (`/plan/`, TRA-144) renders option cards, a brief checklist and a live
itinerary. The chat stream (`/api/v1/ai/chat`) only carries text (`data: {"content"}`), so
the page was built against a hand-kept mirror of the event contract described in TRA-142 and,
until the backend existed, against a recorded session played by the browser (TRA-158).

Two constraints shape the backend side. `ai_api` runs on Lambda with nothing shared between
requests (backend AGENTS, Lambda runtime model), so the server cannot remember the brief or the
itinerary between turns. And the corpus (ADR 0014) is the only source of places: the product rule
is that the model never invents a place, a price or an opening time.

## Decision

**One typed stream.** `POST /api/v1/ai/planner` answers `text/event-stream` with one JSON
object per `data:` line and `data: [DONE]` last, framed by `infrastructure/sse.py::sse_events`.
Events are a Pydantic discriminated union on `type` (`schemas/planner_events.py`): `text`,
`brief`, `options`, `itinerary_patch`, `error`, `done`. Itinerary ops are a second union
discriminated on `op` with flat fields (`set_stay`, `put_activity`, `remove_activity`,
`set_day_title`, `set_route`, `set_weather`, `warn`). No wire field is optional: unknown values
travel as `null`, never missing, so the generated TypeScript has no `?` and the browser needs no
defaults. Error codes are the domain codes (`UNAUTHORIZED`, `SERVICE_UNAVAILABLE`, `INTERNAL`),
as in the chat stream.

**The contract is generated, not mirrored.** A streamed body has no response model, so
`ai_api/openapi.py` wraps `app.openapi()` and adds `PlannerEvent`, `ItineraryOp`, `PlannerTurn`
and every model they reference to `components.schemas`. `just contracts` then produces
`docs/api/ai-api.openapi.json` and `src/frontend/src/types/generated/ai-api.ts`, and
`src/frontend/src/types/planner.ts` re-exports from there. CI's `contracts-check` catches drift.

**The client carries the state.** Every request (`PlannerTurn`) brings the transcript, the
brief and the itinerary snapshot (card ids only). The server derives what to do from the request
alone: a `select`/`remove` action on a group it minted, or a message it classifies. Group ids
encode their meaning (`nb`, `hotels:<district>`, `slot:<day>:<part>`) so a selection can be
interpreted without a session store. Cards are re-hydrated from the corpus by document id, never
trusted from the client.

**The model picks, the corpus describes.** Every `OptionCard` is built from a retrieved
document's metadata (`application/cards.py`); the model's only free text on a card is `why`
(≤ 140 characters). Ids the model returns that were not retrieved are dropped. Prices are tiers
(`price_tier` 1–3) and flights are a prefilled search link (`set_route`), never a number.
Weather comes from Open-Meteo's forecast when the dates are within reach and from the corpus's
climate normals otherwise.

## Consequences

- Good: one contract in one place, typed on both sides; the browser's demo mode retires by itself
  the moment the route answers 200; the server stays stateless and cheap (Lambda, no store).
- Good: the "no invented places" rule is structural (ids constrained to retrieved documents), not
  a prompt promise.
- Bad: every turn re-sends the whole brief and snapshot (a few KB) and the server re-fetches the
  cards it needs by id; acceptable at this size, revisit if itineraries grow past a couple of
  weeks or the snapshot starts carrying more than ids.
- Bad: the group-id convention is an implicit contract between two turns of the same server
  version; a deploy in the middle of a session can make an old carousel unselectable (the
  server answers with a fresh carousel instead of failing).
- Revisit: persisting the draft as a `planning` Trip (TRA-146) will give the server a real id to
  key on; the snapshot stays as the fallback for unsaved drafts.
