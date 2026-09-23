# AGENTS.md — core_api

Read [`backend/AGENTS.md`](../../AGENTS.md) first. `core_api` owns authentication, users, trip data and chat conversations,
all of it in **one DynamoDB table** ([ADR 0023](../../../../docs/architecture/adr/0023-dynamodb-data-store.md)).

## Layers (dependencies point inward)

```text
api/v1/endpoints/*.py   HTTP only: parse, inject, call the service, return a schema
      ↓
services/*.py           use cases; raise travel_common.exceptions.*; never import FastAPI or boto3
      ↓
domain/ports.py         repository protocols the services depend on
domain/models.py        plain dataclasses + their rules (check_invariants, phase, ensure_editable)
      ↑
infrastructure/dynamo/  the only adapter: table.py, keys.py, codec.py, repositories.py
```

- **Only `infrastructure/dynamo/` imports boto3/botocore**, and nothing imports `devtools`
  (`tests/test_import_boundaries.py` checks both).
- **Settings are injected**, never imported as a singleton: `Depends(get_settings)` in dependables,
  `get_settings()` at the composition root (`main.py`). The app `lifespan` calls
  `infrastructure/dynamo/table.py::open_table`: it builds the client
  (`dynamodb_client(DYNAMODB_ENDPOINT_URL, AWS_REGION)`), puts a `DynamoTable` on `app.state`, and
  creates the table **only when `DYNAMODB_ENDPOINT_URL` is set** (local, Compose, tests; on AWS
  Terraform owns `travel-ai-core`). `CORE_TABLE` defaults to `travel-ai-local-core`, a name no real
  table has.
- `api/deps.py`: `get_table(request)` → `get_*_repository` → `get_*_service`. `get_current_user`
  runs the `Authenticate` use case (`services/auth_service.py`): `travel_common.security.verify_token`
  **plus** the account. Local tokens name the account by its id (a UUID; anything else is 401);
  Cognito mode upserts the account from the claims (profile and `admin` group) and **writes only when
  something changed**, so a request does not cost a write. Inactive accounts are 401 in both. It
  returns an `AccountPrincipal` (`auth/principal.py`: a `Principal` plus the account's UUID).
- **Local-mode sign-in is a use case** (`services/auth_service.py::SignIn`) behind the
  `IdentityVerifier` port (`auth/google.py`); `GoogleTokenInfoVerifier` is its only adapter. The
  `/auth` router is mounted only when `AUTH_MODE=local` (`api/v1/api_router.py::build_api_router`);
  with Cognito the pool issues the tokens. Tests override `get_identity_verifier` with a fake, and
  `tests/api/test_cognito_mode.py` builds a second app with `CognitoTestIssuer` settings.
- **`Trip` is the aggregate root** (ADR 0005) and **one item**: its days, stays and journeys, and each
  day's activities and meals, are embedded in the trip. Child collections are nested under
  `/trips/{trip_id}/...` and resolved once by `get_owned_trip_node` / `get_owned_itinerary_day` (reads)
  or their `editable` twins (writes), which return a `Located(trip, parent)`. A child write is: change
  the aggregate, `trips.save(trip)` (`services/trip_children.py`: one `ChildKind` per collection,
  generic list/get/create/update/delete). A child's `updated_at` moves when it is patched; the trip's
  only when its own fields are. A child under another trip is a 404: the lookup never leaves the
  caller's trip.
- **A trip is one city, and its phase is derived** (ADR 0019). `phase_of(start, end, today)` (in
  `domain/models.py`) answers `upcoming | ongoing | past` and `TripResponse` exposes it as a
  `computed_field` on the server's UTC date — nothing stores it.
- **Ongoing and past trips are read-only.** `Trip.ensure_editable()` raises `TripLocked` (409,
  `TRIP_LOCKED`); `TripService.update` calls it, and writes resolve their parent through the
  editable dependencies. `DELETE /trips/{id}` is never locked.
- **The planner's cards ride along.** Activities, meals and accommodations carry `source_ref` and
  `card`, an opaque JSON object core_api stores (as a JSON string, so `null`s and floats survive) and
  returns untouched; its shape is ai_api's (`OptionCard`).
- **`ChatThread` is a second root** (ADR 0013), stored without its messages. Messages are
  append-only (list and append): `ChatMessageRepository.append` writes the message and moves the
  thread's `updated_at` and `version` in one `TransactWriteItems`, and never lets a message sort
  before the last one (`created_at = max(now, last + 1 µs)`).
- **Ownership is the key.** Trips and threads live under `USER#<owner>`: `get_owned_*` reads with
  the caller as owner, so **another user's trip or thread is 404**, not 403. User endpoints keep
  their rules: `PATCH/DELETE /users/{id}` by someone else is 403, admin reads are 403 for non-admins.
- **Admin reads** (ADR 0024) live in `api/v1/endpoints/admin.py` under `/admin`: every trip
  (`TripService.list_all` → GSI2, newest first), any trip by owner and id (`get_any`), every
  account (`UserService.list_page` → GSI1), each by cursor. The router's dependency
  `audit_admin_read` checks the admin and logs `admin_read subject=… route=… target=…` once.
- **`User.subject`** is the `sub` of the account's tokens: `upsert_from_identity` writes the
  identity's subject (Cognito) or the account id (`subject_is_account_id=True`, local sign-in;
  `devtools` sets it too), only when it changes. The AI traces name users by it, never by email.
  `google_id` is kept as it was. **`Trip.planner_session_id`** links a trip to the planner
  turns that made it; writable like any trip field, and locked with them.
- Pagination: every list endpoint takes `Page` via `Depends(page_params)` (`skip`, `limit ≤ 500`);
  a user's trips and threads come from one `Query` and are sorted and sliced in the service.
- Partial updates are `PATCH`; `PUT` is not used. `services/__init__.py::apply_changes` sets the
  fields the client sent, re-runs `check_invariants` and moves `updated_at`: PATCH cannot break
  what POST enforces, and a rejected change is never saved.
- **Entity rules live on the entity** (`domain/models.py`): `check_invariants()` raises
  `travel_common.exceptions.*`. Single-field formats (`TimeOfDay`, `CountryCode`, `Money`, ...) are the
  `Annotated` types in `schemas/_types.py`; closed vocabularies are `domain/enums.py`.

## The table (ADR 0023)

| Item | `PK` | `SK` |
|---|---|---|
| Account | `USER#<user_id>` | `PROFILE` (`GSI1PK=USERS`, `GSI1SK=<email>`: the admin list) |
| Email uniqueness | `EMAIL#<email, lowercased>` | `EMAIL` → `{user_id}` |
| Trip (whole aggregate) | `USER#<user_id>` | `TRIP#<trip_id>` (`GSI2PK=TRIPS`, `GSI2SK=<created_at, µs, UTC>#<trip_id>`: the admin list) |
| Conversation | `USER#<user_id>` | `THREAD#<thread_id>` |
| Message | `THREAD#<thread_id>` | `MSG#<created_at, µs, UTC>#<message_id>` |

- **GSI2 projects a summary on AWS** (`INCLUDE`: `id`, `user_id`, `title`, `city_slug`, `city`,
  `country_code`, dates, `image_url`, timestamps, `planner_session_id`, `version`), which is what
  `TripSummary` (`domain/models.py`) decodes; locally `ensure_table` projects everything. A field
  the admin list needs must be added to `non_key_attributes` in `infra/aws/dynamodb.tf` too.
  Index pages go by cursor (`_index_page`: base64url of `LastEvaluatedKey`; a cursor that is not
  one this index issued is `BadRequest`). Trips saved before GSI2 carry no `GSI2PK` and are
  absent from the admin list until they are saved again.
- **Optimistic concurrency**: profile, trip and thread carry `version`; creates are conditional on
  `attribute_not_exists(PK)`, changes on `version = :expected`. A failed condition is `Conflict`
  (409, "changed by another request, reload and retry"; a taken email: "email already registered").
  The profile and its `EMAIL#` item are written in one transaction (an email change moves it).
- **No cascades in the database**: deleting a thread deletes its messages first (batches of 25,
  unprocessed items retried with backoff); deleting a user deletes every thread's messages, every
  item under `USER#<id>` and the `EMAIL#` item.
- **A trip over 350 KB** (its JSON) is `UnprocessableEntity("This trip is too large")`.
- **No migrations.** A schema change is a change to the dataclass and, if needed, the codec
  (`infrastructure/dynamo/codec.py`); **items already written must stay readable** — a field missing
  from an old item takes the dataclass default. Rewriting old items, if ever needed, is a one-off
  script run from a shell, never a route of the deployed service.
- A new child entity: dataclass in `domain/models.py` (+ its list on the parent) → `schemas/x.py`
  (`XBase`, `XCreate`, `XUpdate = partial(XBase, "XUpdate")`, `XResponse`) → a `ChildKind` in
  `services/trip_children.py` → one `ChildResource` in `api/v1/resources.py` → `just contracts`.

## Operations

- The deployed function exposes no commands: nothing but HTTP under `/api/v1` reaches it. The
  one-off copy from RDS (`copy-from-postgres`) ran on 2026-09-22 and was removed with RDS in
  TRA-219.
- **Dev-only helpers live in `devtools.py`**: `python -m core_api.devtools token
  <email>` (`just dev-token <email>`) prints the local-mode JWT the sign-in would issue for that
  account (`sub` = its UUID, `email`, `role`, `exp`), **creating it when it is new**, so the
  Playwright suite and the Playwright MCP sign in without Google. `--admin`
  (`just dev-token <email> --admin`) stores `role=admin` first; without it the role is left alone. It honours
  `DYNAMODB_ENDPOINT_URL` like the service. Nothing in the service imports `devtools`
  (`tests/test_import_boundaries.py` checks it). Refuses in Cognito mode.

## Commands

```bash
just dynamodb-local                # another terminal: moto on :8002 (the devcontainer has DynamoDB Local)
uv run uvicorn core_api.main:app --reload --port 8000
uv run python -m core_api.devtools token you@example.com   # local JWT for that account (just dev-token)
uv run python -m core_api.devtools token you@example.com --admin   # ... as an administrator
uv run pytest                      # moto in process, no database
```

Tests: `tests/conftest.py` wraps every test in `mock_dynamodb()`, creates the table and overrides
`get_table`; `make_user(email, role)` goes through the repository. Env: `.env.example`. Never add
`NVIDIA_*` here — that is `ai_api`'s.
