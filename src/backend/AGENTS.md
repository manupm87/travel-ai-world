# AGENTS.md — backend workspace

Read the root [`AGENTS.md`](../../AGENTS.md) first. This file covers the `src/backend/` uv workspace.

## Layout

```text
src/backend/
├── pyproject.toml          workspace root: members, dev deps, ruff, pytest
├── uv.lock                 ONE lockfile for every member (never edit by hand; `uv lock`)
├── Dockerfile              one file, two images: --build-arg SERVICE=core_api|ai_api; Lambda Web Adapter
│                           in /opt/extensions (per-service AWS_LWA_* stage), inert outside Lambda
├── docker-compose.yml      proxy :8080 → frontend export (/) / core_api (/api/) / ai_api (/api/v1/ai/), PostgreSQL
├── docker/                 entrypoint.sh (serve, or `migrate`; no auto-migration on Lambda), nginx.conf
├── scripts/export_openapi.py
├── libs/travel_common/     shared kernel (see rules below)
├── services/
│   ├── core_api/           N-tier CRUD: api → services → repositories → models
│   └── ai_api/             ports & adapters: domain → application → infrastructure → api
└── tools/
    ├── scraper/            scripts, `package = false`: linted and locked here, never in an image
    └── city_corpus/        RAG corpus builder (Wikivoyage/Wikipedia → JSONL), same model; see its AGENTS.md
```

## Commands (from `src/backend/`, or via `just` from the repo root)

```bash
uv sync --all-packages                   # whole workspace (incl. tools/) into src/backend/.venv
uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
uv run pyright                           # libs/ and services/, standard mode (CI runs it in `just lint-backend`)
cd services/core_api && uv run pytest    # needs PostgreSQL
cd services/ai_api   && uv run pytest    # no external deps
cd libs/travel_common && uv run pytest
uv run python scripts/export_openapi.py  # → docs/api/*.openapi.json (then `npm run types:generate` in frontend)
```

## Rules

- **`travel_common` holds only what crosses a service boundary**: `Principal`/`Claims`, `CommonSettings`,
  domain exceptions, token verification (`security.py` dispatches on `AUTH_MODE`: local HS256 or
  `cognito.py`'s RS256/JWKS), bearer extraction, the FastAPI app factory and error handlers, plus
  `testing.py` (`CognitoTestIssuer`) for every package's tests.
  If a thing is used by one service, it belongs to that service. Never add SQLAlchemy or httpx-based
  clients to `travel_common`.
- **Settings**: each service subclasses `CommonSettings` and exposes `get_settings()` (cached);
  inject it with `Depends(get_settings)` — no module-level `settings` singleton. Token helpers take
  `settings` explicitly. `AUTH_MODE` and its settings (`SECRET_KEY` in local mode; `COGNITO_ISSUER`,
  `COGNITO_CLIENT_ID`, `COGNITO_JWKS` in Cognito mode) must be the same in both services' `.env`.
- **Process resources** (database engines, HTTP clients) are created in the app `lifespan` passed to
  `create_app(..., lifespan=...)` and stored on `app.state`, never at import time.
- **Errors**: services raise `travel_common.exceptions.*`; `travel_common.http.error_handlers` maps
  them to `{"detail": {"message", "error_code", "extras"}}`. Endpoints never raise `HTTPException`.
- **Adding a dependency**: edit the *member's* `pyproject.toml`, then `uv lock` at the workspace root.
- **Tools** (`tools/*`) are workspace members with `package = false`: they get the venv, the lock and
  ruff, but are never imported by a service nor copied into an image.
- **Adding a service**: `services/<name>/pyproject.toml` (name with dashes, package with underscores),
  add it to the root `dependencies` + `[tool.uv.sources]`, a `tests/` dir, an `AGENTS.md`, a `README.md`,
  a `.env.example`, a CI job in `.github/workflows/pr.yml`, and the image in `backend-images.yml`.
- **Tests** run per package with `--import-mode=importlib`; never `from tests.x import` across packages.
- **Lint policy** lives in the root `pyproject.toml`: ruff `I, UP, B, SIM, N, RUF, ASYNC, S` on top of
  `E/F`, `B008` and `N818` ignored on purpose (FastAPI defaults; domain error names), tests may
  `assert` and hold fake secrets, `tools/scraper/**` keeps the old E/F-only set (`tools/city_corpus` gets
  the full set and pyright). Type-check with pyright
  (`[tool.pyright]`); prefer fixing the type over `# pyright: ignore`, and justify every ignore.
- **Runtime model (Lambda): nothing runs after the response.** In production both services are the
  same FastAPI app, but each one runs inside an AWS Lambda execution environment behind the
  [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) (ADR 0009). The adapter
  starts uvicorn once per environment and turns each invocation into an HTTP request to it. Two
  documented consequences drive the rules below ([execution environment lifecycle](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html),
  [concurrency](https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html)):
  *"this execution environment is busy and cannot process other requests"*, and *"background
  processes or callbacks ... resume if Lambda reuses the execution environment"* — between
  invocations the whole process is frozen.

  Works as you expect: `async`/`await` and `asyncio.gather` **inside** one request (they finish
  before you respond); the app `lifespan` for per-environment resources (engines, HTTP clients);
  streaming responses (`ai_api` runs in `response_stream` mode); `/tmp` and `lru_cache` as a
  per-environment cache — `travel_common/cognito.py` caches the JWKS this way, so a cached key set
  can outlive a rotation by the life of the environment.

  Never in a service: `BackgroundTasks` or any work scheduled after the response (it freezes
  mid-flight and resumes minutes later, or never); fire-and-forget `asyncio.create_task`; threads,
  timers or schedulers; in-memory queues, counters or anything shared between requests (each
  request may hit a different environment); WebSockets; anything slower than the function timeout
  (30 s `core_api`, 900 s `ai_api`). `lifespan` shutdown is best-effort: the shutdown phase is
  capped at 2 s before `SIGKILL`.

  Where that work goes instead: a CLI command run outside the request path (`city_corpus`,
  `core_api.ops`, the `migrate`/`seed` entrypoints), or its own scheduled function. If a request
  genuinely needs to hand off work, it must leave the process (a queue or another function), not
  live in it.
- **Logging**: `create_app` calls `travel_common.http.logging.configure_logging(settings.LOG_LEVEL)`
  once; modules use `logging.getLogger(__name__)`, never `print`.
