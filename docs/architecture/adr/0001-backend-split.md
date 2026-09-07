# 0001 — Split the backend into `core_api` and `ai_api`

**Status:** Accepted
**Date:** 2026-09-07

## Context

The backend was one FastAPI app (~3,150 lines). The AI part was tiny (a ~300-line SSE proxy to
NVIDIA) but the roadmap adds retrieval (the `Scraper/` output is "ready for embeddings"), which
brings heavy dependencies (embedding models, vector clients), long-lived streaming connections
and a different scaling profile from millisecond CRUD calls. The only coupling between the two
halves was `get_current_user` reading the user row from PostgreSQL.

The code also carried debt the split would have copied: eight identical repositories, services
and endpoint files; `HTTPException` subclasses used as domain errors; an ORM `User` leaking into
every endpoint; NVIDIA details hard-wired into the chat service; no tests for the CRUD side.

## Decision

1. **Two deployable services in a uv workspace** under `backend/`:
   - `services/core_api` — Google auth, users, trips CRUD. N-tier layers, generic
     `BaseRepository`/`BaseService`, PostgreSQL, Alembic.
   - `services/ai_api` — chat streaming and, later, RAG. Ports and adapters
     (`domain/ports.py`: `LLMProvider`, `Retriever`, `TripGateway`). No database, no ORM.
   - `libs/travel_common` — only what crosses the boundary: `Principal`, `CommonSettings`,
     domain exceptions, JWT codec, bearer extraction, app factory. If `travel_common` grows
     with single-service code, the boundary is leaking.
2. **Refactor before moving**: `Principal` value object, domain errors mapped by one handler,
   generic repository/service, `provide()` wiring, trip ownership. Done in the same branch, as a
   separate commit, with tests.
3. **One direction of calls**: `ai_api → core_api` over HTTP. `core_api` never depends on `ai_api`.
4. **One `Dockerfile`, two images** (`--build-arg SERVICE=`), published to GHCR by CI; Terraform
   for GCP and AWS deploys two services with per-service secrets.
5. **Routes**: `ai_api` under `/api/v1/ai/*` so any proxy can route by prefix.
6. **Contracts**: OpenAPI documents exported to `docs/api/` and TypeScript types generated from
   them; CI fails on drift.

## Consequences

- Positive: the AI image stays free of SQLAlchemy and `core_api` code; NVIDIA credentials live in
  one container; each service scales and fails independently; a provider swap or a retriever is a
  new adapter, not a rewrite; the CRUD side lost ~750 duplicated lines and gained tests.
- Negative: two deployables and two `.env` files (shared `SECRET_KEY`); a revoked user keeps AI
  access until the token expires (ADR 0002); one more hop when the AI service persists data.
- Behaviour changes shipped with the refactor: trip listing is scoped to the owner; user listing is
  admin-only; `TripResponse` nested field names now match the ORM (`itinerary_days`,
  `accommodations`, `transportations`); non-admin role checks answer 403 instead of 401.
- Open: `trips.ts` in the frontend still serves fixtures (see [ADR 0006](0006-frontend-trip-view-model.md)
  for the mapping and the plan). Nested-entity ownership was closed by
  [ADR 0005](0005-trip-aggregate-nested-resources.md).
