# AGENTS.md — core_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `core_api` owns authentication, users, trip data and chat conversations.

## Request lifecycle (N-tier, dependencies point inward)

```text
api/v1/endpoints/*.py   HTTP only: parse, inject, call the service, return a schema
      ↓
services/*.py           business rules; raise travel_common.exceptions.*; never import FastAPI
      ↓
repositories/*.py       SQLAlchemy only; never import Pydantic schemas
      ↓
models/*.py             tables (DeclarativeBase, SQLAlchemy 2 style)
```

- **Settings are injected**, never imported as a singleton: `Depends(get_settings)` in dependables,
  `get_settings()` at the composition root (`main.py`, `alembic/env.py`). The engine is built in the
  app `lifespan` and the session factory lives on `app.state`; `get_db` reads it from the request.
- `api/deps.py`: `get_current_user` runs the `Authenticate` use case (`services/auth_service.py`):
  `travel_common.security.verify_token` **plus** the database. Local mode looks the account up by
  the token's subject; Cognito mode upserts it from the claims (profile and `admin` group) on every
  request. Inactive accounts are 401 in both. It returns an `AccountPrincipal`
  (`auth/principal.py`: a `Principal` plus the `users.id`); `provide(Service, Model[, Repository])`
  wires services — do not write per-entity factories.
- **Local-mode sign-in is a use case** (`services/auth_service.py::SignIn`) behind the
  `IdentityVerifier` port (`auth/google.py`); `GoogleTokenInfoVerifier` is its only adapter. The
  `/auth` router is mounted only when `AUTH_MODE=local` (`api/v1/api_router.py::build_api_router`);
  with Cognito the pool issues the tokens. Tests override `get_identity_verifier` with a fake, and
  `tests/api/test_cognito_mode.py` builds a second app with `CognitoTestIssuer` settings.
- **`Trip` is the aggregate root** (ADR 0005). Child collections are nested under
  `/trips/{trip_id}/...` and authorised once by `get_owned_trip` (or `get_owned_itinerary_day`
  for activities and meals). Services scope every query with `get_in(id, trip_id=...)` /
  `list(page, trip_id=...)`; a child under another parent is a 404.
- **A trip is one city, and its phase is derived** (ADR 0019). `Trip` carries `city_slug` (the
  planner's name for the city, and the key that reopens the trip), `city`, `country`,
  `country_code`, the centre, `origin` and `budget_tier`; there is no `destinations` table and no
  stored `status`. `phase_of(start, end, today)` (in `models/trip.py`) answers
  `upcoming | ongoing | past` and `TripResponse` exposes it as a `computed_field` on the server's
  UTC date — nothing writes it, so a trip becomes ongoing and then past on its own.
- **Ongoing and past trips are read-only.** `Trip.ensure_editable()` raises `TripLocked` (409,
  `TRIP_LOCKED`); `TripService.update` calls it, and **writes** resolve their parent through
  `get_editable_trip` / `get_editable_itinerary_day` while reads keep `get_owned_*`. The lock is
  the aggregate's, so it covers every child without an endpoint mentioning it. `DELETE
  /trips/{id}` is never locked: removing a trip is not changing it.
- **The planner's cards ride along.** `activities` and `meals` carry `source_ref` (the corpus id,
  indexed), `part_of_day` and `card`; `accommodations` carry `source_ref` and `card`. `card` is an
  opaque JSON object: core_api stores it and returns it untouched, and never interprets it — the
  shape is ai_api's (`OptionCard`) and the two services share no code.
- **`ChatThread` is a second root** (ADR 0013), owned by a user like a trip:
  `get_owned_chat_thread` authorises once (403 for another user's thread) and its messages live
  under `/chat-threads/{thread_id}/messages/`. Messages are append-only (list and append, no
  PATCH or DELETE): `ChatMessageService.append` checks the entity and
  `ChatMessageRepository.append` moves the thread's `updated_at`. Neither model declares
  relationships on purpose: the foreign keys cascade in the database, so nothing lazy-loads.
- `repositories/base.py` and `services/base.py` are generic and cover every child entity. A new
  child entity is: `models/x.py` → register in `models/__init__.py` → `schemas/x.py`
  (`XBase`, `XCreate`, `XUpdate = partial(XBase, "XUpdate")`, `XResponse`) → one `ChildResource`
  entry in `api/v1/resources.py` → `just migration "add x"` → `just contracts`. Subclass
  `BaseRepository`/`BaseService` only when the entity needs custom queries or rules (`Trip`, `User`).
- Ownership: anything a user owns goes through `TripService.get_owned(id, principal)` (403 for
  another user's trip), `ChatThreadService.get_owned` or `UserService.get_owned`.
- Pagination: every list endpoint takes `Page` via `Depends(page_params)` (`skip`, `limit ≤ 500`).
- Partial updates are `PATCH`; `PUT` is not used.
- Aggregates the API returns whole must eager-load children (`lazy="selectin"`); async serializers
  cannot lazy-load.
- **Models** use the SQLAlchemy 2 typed style (`Mapped[...]`, `mapped_column`) and compose the mixins
  in `models/base.py` (`UUIDPrimaryKeyMixin`, `TimestampMixin`, `TripChildMixin`,
  `ItineraryDayChildMixin`, `CoordinatesMixin`, `LocationSnapshotMixin`, `PlannerCardMixin`,
  `PartOfDayMixin`). Closed vocabularies live in
  `models/enums.py` and are reused by the schemas (and therefore by the OpenAPI contract).
- **Entity rules live on the entity**: override `check_invariants()` (see `Trip`,
  `Accommodation`, `Transportation`) and raise `travel_common.exceptions.*`. `BaseService` calls it
  before every create and update, so PATCH cannot break what POST enforces. Single-field formats
  (`TimeOfDay`, `CountryCode`, `Money`, `Rating`, ...) are the `Annotated` types in `schemas/_types.py`.
- **One transaction per request**: `db/session.py::unit_of_work` commits when the request succeeds
  and rolls back on any exception (domain errors included). Repositories only `flush`; never call
  `commit()` from a repository or a service.
- **No demo seed** (ADR 0019): trips are made in the planner and saved through the API. `migrate`
  is the whole of `ops.COMMANDS`, and therefore the whole surface `POST /events` exposes.
- **Dev-only helpers live in `devtools.py`, never in `ops.py`**: `python -m core_api.devtools token
  <email>` (`just dev-token <email>`) prints the local-mode JWT the sign-in would issue for that
  account (`sub` = its id, `email`, `role`, `exp`), **creating it when it is new**, so the
  Playwright suite and the Playwright MCP sign in without Google. `ops.COMMANDS` is the surface `POST /events` exposes, so a
  token minter must not be one of them; nothing in the service imports `devtools`
  (`tests/test_devtools.py` checks both). Refuses in Cognito mode: those tokens come from the pool.

## Commands

```bash
uv run uvicorn core_api.main:app --reload --port 8000
uv run python -m core_api.devtools token you@example.com   # local JWT for that account (just dev-token)
uv run pytest                      # PostgreSQL: creates <DB_NAME>_test and empties it between tests
                                   # each request gets its own session; use `db_session` only to arrange data
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "message"   # review the file before committing
uv run alembic check               # models and migrations agree (CI runs this)
```

Env: `.env.example`. Never add `NVIDIA_*` here — that is `ai_api`'s.
