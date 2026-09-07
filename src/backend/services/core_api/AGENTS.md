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
- `api/deps.py`: `get_current_user` (JWT **plus** a DB check that the account is active) returns a
  `Principal`; `provide(Service, Model[, Repository])` wires services — do not write per-entity factories.
- **Sign-in is a use case** (`services/auth_service.py::SignIn`) behind the `IdentityVerifier` port
  (`auth/google.py`); `GoogleTokenInfoVerifier` is its only adapter today. The endpoint just calls it;
  tests override `get_identity_verifier` with a fake.
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

## Commands

```bash
uv run uvicorn core_api.main:app --reload --port 8000
uv run pytest                      # PostgreSQL: creates <DB_NAME>_test and empties it between tests
                                   # each request gets its own session; use `db_session` only to arrange data
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "message"   # review the file before committing
uv run alembic check               # models and migrations agree (CI runs this)
```

Env: `.env.example`. Never add `NVIDIA_*` here — that is `ai_api`'s.
