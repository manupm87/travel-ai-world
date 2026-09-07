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

- `api/deps.py`: `get_current_user` (JWT **plus** a DB check that the account is active) returns a
  `Principal`; `provide(Service, Model[, Repository])` wires services — do not write per-entity factories.
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

## Commands

```bash
uv run uvicorn core_api.main:app --reload --port 8000
uv run pytest                      # PostgreSQL: creates <DB_NAME>_test and empties it between tests
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "message"   # review the file before committing
uv run alembic check               # models and migrations agree (CI runs this)
```

Env: `.env.example`. Never add `NVIDIA_*` here — that is `ai_api`'s.
