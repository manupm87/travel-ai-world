# core_api

Users and trip data (trips, destinations, itinerary days, activities, meals, accommodations,
transportations) on PostgreSQL. Owns the account behind every bearer token: in local mode it also
signs people in with Google and issues the JWTs every service trusts; in Cognito mode
([ADR 0009](../../../../docs/architecture/adr/0009-lambda-cognito-budget.md)) the user pool issues
them and this service upserts the account from the claims.

## Run

```bash
cp .env.example .env       # AUTH_MODE=local: SECRET_KEY, GOOGLE_*, DB_* (Cognito mode: COGNITO_*)
uv run alembic upgrade head
uv run python -m core_api.ops seed you@example.com       # optional: the four demo trips for that account
uv run uvicorn core_api.main:app --reload --port 8000    # http://localhost:8000/docs
```

`seed` (`just seed you@example.com` from the repo root) creates the account if it does not exist
and loads the demo trips through the services, so the same rules apply as to a request; running
it again replaces those trips and leaves the account's other trips alone. The same command runs
in the container (`entrypoint.sh seed <email>`) and on Lambda (`{"command": "seed", "args":
{"email": "..."}}` on `/events`); see [ADR 0011](../../../../docs/architecture/adr/0011-real-trips-seed-and-client-side-loading.md).

## Endpoints (`/api/v1`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/auth/google` | — | Local mode only: Google ID token → our JWT + profile (absent when `AUTH_MODE=cognito`) |
| `GET` | `/users/me` | Bearer | Own profile |
| `GET` | `/users/` | Admin | List users |
| `GET` | `/users/{id}` | Admin | Profiles are not public |
| `PATCH/DELETE` | `/users/{id}` | Bearer (owner) | Only your own account |
| `PATCH` | `/users/{id}/role` | Admin | |
| `GET/POST` | `/trips/` | Bearer | Only the caller's trips |
| `GET/PATCH/DELETE` | `/trips/{id}` | Bearer (owner) | 403 for another user's trip; response embeds every child |
| CRUD | `/trips/{id}/destinations/`, `/trips/{id}/itinerary-days/`, `/trips/{id}/accommodations/`, `/trips/{id}/transportations/` | Bearer (owner) | Nested under the owner's trip |
| CRUD | `/trips/{id}/itinerary-days/{day_id}/activities/`, `.../meals/` | Bearer (owner) | Nested under a day of the owner's trip |
| `GET` | `/health/`, `/health/db` | — | |
| `POST` | `/events` (root, not versioned, not in the OpenAPI document) | Lambda only | `{"command": "migrate"}` from a direct Lambda invocation; unknown commands 400; 404 outside Lambda |

Every collection offers `GET /` (paginated with `skip`/`limit`), `POST /`, `GET/PATCH/DELETE /{item_id}`.
A child that exists under another trip answers 404, never 403, so ids leak nothing
([ADR 0005](../../../../docs/architecture/adr/0005-trip-aggregate-nested-resources.md)).

Full contract: [`docs/api/core-api.openapi.json`](../../../../docs/api/core-api.openapi.json).

Errors: `{"detail": {"message": "...", "error_code": "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | ...}}`.

## Layout

```text
core_api/
├── main.py            create_app(get_settings(), [build_api_router(settings)], lifespan=...) — engine on app.state
├── config.py          CoreSettings(CommonSettings): DB_*, GOOGLE_*; get_settings() (injected)
├── api/deps.py        get_current_user (token + DB check) → AccountPrincipal; provide() wiring;
│                      get_owned_trip / get_owned_itinerary_day (aggregate boundary); get_sign_in
├── api/v1/endpoints/  thin controllers for auth (local mode only), users, trips, health
├── api/v1/resources.py  CHILD_RESOURCES + child_router(): the nested CRUD collections
├── auth/google.py     IdentityVerifier port + GoogleTokenInfoVerifier adapter (local mode)
├── auth/principal.py  AccountPrincipal = Principal + users.id
├── services/          base.py (generic; every child entity) + trip_service.py, user_service.py,
│                      auth_service.py (Authenticate: both modes; SignIn: local issuer)
├── repositories/      base.py (generic) + trip_repository.py, user_repository.py
├── models/            SQLAlchemy 2 typed tables; mixins + check_invariants() in base.py; enums.py
├── schemas/           Pydantic models; XUpdate = partial(XBase) (_partial.py); formats in _types.py
├── ops.py             commands a deployed function runs on request (`migrate` = alembic upgrade head)
├── api/events.py      POST /events: the Lambda Web Adapter's pass-through for direct invocations
├── pagination.py      Page(skip, limit)
└── db/session.py      build_engine / build_session_factory + get_db (one transaction per request)
```

## Tests and migrations

```bash
uv run pytest                                          # creates <DB_NAME>_test, empties it per test
uv run alembic revision --autogenerate -m "message"    # after changing models; review the file
uv run alembic check                                   # models == migrations (CI runs it)
```

For agents: [`AGENTS.md`](AGENTS.md).
