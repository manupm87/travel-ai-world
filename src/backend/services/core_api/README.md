# core_api

Users, trip data (trips, itinerary days, activities, meals, accommodations, transportations)
and chat conversations (threads and their messages), all in one DynamoDB table
([ADR 0023](../../../../docs/architecture/adr/0023-dynamodb-data-store.md)). Owns the account behind every bearer token: in local mode it also
signs people in with Google and issues the JWTs every service trusts; in Cognito mode
([ADR 0009](../../../../docs/architecture/adr/0009-lambda-cognito-budget.md)) the user pool issues
them and this service upserts the account from the claims.

## Run

```bash
cp .env.example .env       # AUTH_MODE=local: SECRET_KEY, GOOGLE_* (Cognito mode: COGNITO_*)
just dynamodb-local        # from the repo root, in another terminal: DynamoDB on :8002
uv run python -m core_api.devtools token you@example.com # optional: a local JWT for that account (see below)
uv run uvicorn core_api.main:app --reload --port 8000    # http://localhost:8000/docs
```

With `DYNAMODB_ENDPOINT_URL` set (the `.env.example` default, the devcontainer and Compose), the
service creates its table (`CORE_TABLE`) at start when it is missing. Without it the service talks to
DynamoDB on AWS, where Terraform owns the table (`travel-ai-core`); the local default name matches no
real table, so a forgotten endpoint fails instead of writing to production. There are no migrations.

`devtools token` (`just dev-token you@example.com`) prints the local-mode JWT `POST /auth/google`
would issue for that account, so a browser can be signed in without Google: the Playwright suite
(`just test-e2e-stack`) and the Playwright MCP write it into `localStorage`
(`docs/runbooks/local-dev.md`). It creates the account when there is none — the real Google
sign-in adopts it later, matching on the email — refuses an inactive one, and needs
`AUTH_MODE=local`. Creating accounts is exactly why nothing in the running service imports
`devtools` (`tests/test_import_boundaries.py` checks it).

## Endpoints (`/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/google` | — | Local mode only: Google ID token → our JWT + profile (absent when `AUTH_MODE=cognito`) |
| `GET` | `/users/me` | Bearer | Own profile |
| `GET` | `/users/` | Admin | List users, by email |
| `GET` | `/users/{id}` | Admin | Profiles are not public; ids are UUIDs |
| `PATCH/DELETE` | `/users/{id}` | Bearer (owner) | Only your own account (403 otherwise); an email already registered is 409; delete takes trips and conversations with it |
| `PATCH` | `/users/{id}/role` | Admin | |
| `GET/POST` | `/trips/` | Bearer | Only the caller's trips |
| `GET/PATCH/DELETE` | `/trips/{id}` | Bearer (owner) | 404 for another user's trip; response embeds every child and its derived `phase`; `PATCH` is 409 `TRIP_LOCKED` once the trip is ongoing or past, `DELETE` never is |
| CRUD | `/trips/{id}/itinerary-days/`, `/trips/{id}/accommodations/`, `/trips/{id}/transportations/` | Bearer (owner) | Nested under the owner's trip; writes 409 `TRIP_LOCKED` unless the trip is `upcoming` |
| CRUD | `/trips/{id}/itinerary-days/{day_id}/activities/`, `.../meals/` | Bearer (owner) | Nested under a day of the owner's trip; same lock |
| `GET/POST` | `/chat-threads/` | Bearer | Only the caller's conversations, most recent activity first |
| `GET/PATCH/DELETE` | `/chat-threads/{id}` | Bearer (owner) | 404 for another user's thread; the response has no messages; delete takes them with it |
| `GET/POST` | `/chat-threads/{id}/messages/` | Bearer (owner) | Append-only, in the order written; an answer may carry `sources`, `model`, tokens and `latency_ms` ([ADR 0013](../../../../docs/architecture/adr/0013-chat-conversations-in-core-api.md)) |
| `GET` | `/health/`, `/health/db` | — | `/health/db` asks DynamoDB for the table; 503 when it cannot |

Every trip collection offers `GET /` (paginated with `skip`/`limit`), `POST /`, `GET/PATCH/DELETE /{item_id}`.
A child that exists under another trip answers 404, never 403, so ids leak nothing
([ADR 0005](../../../../docs/architecture/adr/0005-trip-aggregate-nested-resources.md)).
Writes that lose a race (someone saved the same trip, thread or profile in between) answer 409
`CONFLICT`: reload and retry.

A trip is **one city** and its `phase` (`upcoming | ongoing | past`) is derived from its dates,
never stored; everything inside an ongoing or past trip is read-only
([ADR 0019](../../../../docs/architecture/adr/0019-trips-live-in-the-planner.md)).

Full contract: [`docs/api/core-api.openapi.json`](../../../../docs/api/core-api.openapi.json).

Errors: `{"detail": {"message": "...", "error_code": "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | ...}}`.

## Layout

```text
core_api/
├── main.py            create_app(...) with a lifespan that opens the table (app.state.table)
├── config.py          CoreSettings(CommonSettings, DynamoSettings): CORE_TABLE, GOOGLE_*
├── domain/            models.py (dataclasses + rules), ports.py (repository protocols), enums.py
├── infrastructure/dynamo/
│                      table.py (spec, DynamoTable, open_table), keys.py, codec.py, repositories.py
├── services/          trip_service.py, trip_children.py (every nested collection), user_service.py,
│                      chat_thread_service.py, chat_message_service.py,
│                      auth_service.py (Authenticate: both modes; SignIn: local issuer)
├── api/deps.py        get_table → repositories → services; get_current_user → AccountPrincipal;
│                      get_owned_trip / get_owned_itinerary_day / get_owned_chat_thread; get_sign_in
├── api/v1/endpoints/  thin controllers for auth (local mode only), users, trips, chat_threads, health
├── api/v1/resources.py  CHILD_RESOURCES + child_router(): the nested CRUD collections
├── auth/google.py     IdentityVerifier port + GoogleTokenInfoVerifier adapter (local mode)
├── auth/principal.py  AccountPrincipal = Principal + the account's UUID
├── schemas/           Pydantic models; XUpdate = partial(XBase) (_partial.py); formats in _types.py
├── devtools.py        dev-only: a local JWT for an account (never imported by the service)
└── pagination.py      Page(skip, limit)
```

## Tests

```bash
uv run pytest      # DynamoDB on moto, in process: no container, no database
```

For agents: [`AGENTS.md`](AGENTS.md).
