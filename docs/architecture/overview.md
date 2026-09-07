# Architecture overview

Travel AI World is a static Next.js frontend and two FastAPI services that share nothing at
runtime except a JWT signing key. See [ADR 0001](adr/0001-backend-split.md) for why.

## Containers

```mermaid
flowchart LR
    Browser["Browser<br/>Next.js static export"]
    Proxy["Reverse proxy<br/>(nginx / ALB)<br/>optional"]
    Core["core_api<br/>FastAPI · SQLAlchemy<br/>auth · users · trips"]
    AI["ai_api<br/>FastAPI · httpx<br/>chat streaming · RAG (future)"]
    PG[("PostgreSQL")]
    Google["Google OAuth<br/>tokeninfo"]
    NVIDIA["NVIDIA<br/>chat completions"]
    Vec[("Vector store<br/>(future, owned by ai_api)")]

    Browser -->|"/api/v1/*"| Proxy
    Proxy -->|"/api/v1/ai/*"| AI
    Proxy -->|"everything else"| Core
    Browser -. "or two base URLs" .-> Core
    Browser -. "or two base URLs" .-> AI
    Core --> PG
    Core --> Google
    AI --> NVIDIA
    AI -. "future" .-> Vec
    AI -->|"HTTP, caller's bearer token"| Core
```

| Component | Owns | Never touches |
|---|---|---|
| `core_api` | users, trips and their children; Google sign-in; JWT issuing | LLM providers |
| `ai_api` | prompts, providers, retrieval, streaming | the relational database, ORM models |
| `travel_common` | `Principal`, settings base, domain errors, JWT codec, app factory | anything used by one service only |

Calls go in one direction only: `ai_api → core_api`. `core_api` works with `ai_api` down.

## Code layout per service

- `core_api` is **N-tier**: `api → services → repositories → models`. Generic `BaseRepository`
  and `BaseService`; endpoints are thin; services raise domain errors; a single handler maps them
  to HTTP. `Trip` is the aggregate root: its children are nested under `/trips/{trip_id}/...` and
  authorised once at the boundary ([ADR 0005](adr/0005-trip-aggregate-nested-resources.md)).
  Entities own their invariants (`check_invariants()`); one transaction per request
  (`unit_of_work`) commits on success and rolls back on any error.
- `ai_api` is **ports and adapters**: `domain` (types + Protocols) ← `application` (use cases) ←
  `infrastructure` (NVIDIA, SSE, core_api client) ← `api` (wiring). Swapping the LLM provider or
  adding a retriever touches only `infrastructure/` and `api/deps.py`.

Two styles on purpose: a CRUD service is best served by layers; an integration-heavy service by
ports. Each service's `AGENTS.md` documents its own.

## Identity

```mermaid
sequenceDiagram
    participant B as Browser
    participant C as core_api
    participant G as Google
    B->>G: Sign in with Google
    G-->>B: ID token
    B->>C: POST /api/v1/auth/google {credential}
    C->>G: tokeninfo?id_token
    G-->>C: sub, email, aud
    C->>C: upsert user · build Principal(id, email, role)
    C-->>B: JWT {sub, email, role, exp} + profile
```

The JWT carries the whole `Principal`, so:

- `core_api` verifies the signature **and** checks the account in the database (revocation is immediate).
- `ai_api` verifies the signature only (stateless). A deactivated user can keep chatting until the
  token expires (60 min). See [ADR 0002](adr/0002-auth-between-services.md).

## Chat

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as ai_api
    participant N as NVIDIA
    B->>A: POST /api/v1/ai/chat {message, history} + Bearer
    A->>A: principal_from_token
    A->>A: StreamChat: [system] + history + [user]
    A->>N: chat/completions (stream)
    N-->>A: SSE deltas
    A-->>B: data: {"content": ...} ×n · data: [DONE]
    Note over A,B: on failure after output started: data: {"error", "error_code"} then [DONE]
```

Wire format is fixed by `ai_api/infrastructure/sse.py` and consumed by `src/frontend/src/services/chat.ts`.

## Service-to-service calls

When `ai_api` must persist something (a generated itinerary), it calls `core_api` **as the user**:
it forwards the same bearer token, so `core_api` applies the same permissions it applies to the
browser. No service secret exists today; add an `INTERNAL_API_KEY` + `/internal/*` router only when
a job must act without a user (RAG ingestion).

## Contracts

Pydantic schemas are the source of truth. `just contracts` exports `docs/api/*.openapi.json` and
regenerates `src/frontend/src/types/generated/*.ts`; CI fails on drift.

## Deployment shapes

| Environment | Origin(s) | Frontend env |
|---|---|---|
| Local `just dev-*` | `:8000` core, `:8001` ai | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AI_API_URL` |
| Docker Compose | nginx `:8080` | `NEXT_PUBLIC_API_URL` only |
| AWS (ALB path rule) | one ALB | `NEXT_PUBLIC_API_URL` only |
| GCP (two Cloud Run) | two URLs | both variables |

See [ADR 0003](adr/0003-frontend-two-base-urls.md) and the [deploy runbook](../runbooks/deploy.md).

## Known gaps (tracked)

- No rate limiting or per-user AI quotas; add at the proxy/gateway when needed.
- `src/frontend/src/services/trips.ts` still serves mock data.
