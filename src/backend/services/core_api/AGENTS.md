# AGENTS.md — core_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `core_api` owns authentication, users and trip data.

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
- `repositories/base.py` and `services/base.py` are generic and cover every child entity. A new
  child entity is: `models/x.py` → register in `models/__init__.py` → `schemas/x.py`
  (`XBase`, `XCreate`, `XUpdate = partial(XBase, "XUpdate")`, `XResponse`) → one `ChildResource`
  entry in `api/v1/resources.py` → `just migration "add x"` → `just contracts`. Subclass
  `BaseRepository`/`BaseService` only when the entity needs custom queries or rules (`Trip`, `User`).
- Ownership: anything a user owns goes through `TripService.get_owned(id, principal)` (403 for
  another user's trip) or `UserService.get_owned`.
- Pagination: every list endpoint takes `Page` via `Depends(page_params)` (`skip`, `limit ≤ 500`).
- Partial updates are `PATCH`; `PUT` is not used.
- Aggregates the API returns whole must eager-load children (`lazy="selectin"`); async serializers
  cannot lazy-load.
- **Models** use the SQLAlchemy 2 typed style (`Mapped[...]`, `mapped_column`) and compose the mixins
  in `models/base.py` (`UUIDPrimaryKeyMixin`, `TimestampMixin`, `TripChildMixin`,
  `ItineraryDayChildMixin`, `CoordinatesMixin`, `LocationSnapshotMixin`). Closed vocabularies live in
  `models/enums.py` and are reused by the schemas (and therefore by the OpenAPI contract).
- **Entity rules live on the entity**: override `check_invariants()` (see `Trip`, `Destination`,
  `Accommodation`, `Transportation`) and raise `travel_common.exceptions.*`. `BaseService` calls it
  before every create and update, so PATCH cannot break what POST enforces. Single-field formats
  (`TimeOfDay`, `CountryCode`, `Money`, `Rating`, ...) are the `Annotated` types in `schemas/_types.py`.
- **One transaction per request**: `db/session.py::unit_of_work` commits when the request succeeds
  and rolls back on any exception (domain errors included). Repositories only `flush`; never call
  `commit()` from a repository or a service.
- **Seed** (`seed/`, ADR 0011): the four demo trips are `TripResponse`-shaped JSON files in
  `seed/data/`; `seed_demo_trips(session_factory, email)` loads them for one account (created if
  missing, adopted by the real sign-in because both modes match by email) through `TripService` /
  `BaseService.create`, so the Create schemas and `check_invariants()` apply and the database
  generates the UUIDs (the loader remaps the fixture ids). Idempotent by `(owner, title)`, one unit
  of work per run. One implementation, three entry points, all through `ops.py`: `just seed <email>`,
  `entrypoint.sh seed <email>` (Compose) and `{"command": "seed", "args": {"email": ...}}` on
  `POST /events` (Lambda). Never load data with raw SQL.

## Commands

```bash
uv run uvicorn core_api.main:app --reload --port 8000
uv run python -m core_api.ops seed you@example.com   # demo trips for that account (just seed)
uv run pytest                      # PostgreSQL: creates <DB_NAME>_test and empties it between tests
                                   # each request gets its own session; use `db_session` only to arrange data
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "message"   # review the file before committing
uv run alembic check               # models and migrations agree (CI runs this)
```

Env: `.env.example`. Never add `NVIDIA_*` here — that is `ai_api`'s.
