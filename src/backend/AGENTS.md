# AGENTS.md — backend workspace

Read the root [`AGENTS.md`](../../AGENTS.md) first. This file covers the `src/backend/` uv workspace.

## Layout

```text
src/backend/
├── pyproject.toml          workspace root: members, dev deps, ruff, pytest
├── uv.lock                 ONE lockfile for every member (never edit by hand; `uv lock`)
├── Dockerfile              one file, two images: --build-arg SERVICE=core_api|ai_api
├── docker-compose.yml      proxy :8080 → core_api / ai_api, PostgreSQL
├── docker/                 entrypoint.sh, nginx.conf
├── scripts/export_openapi.py
├── libs/travel_common/     shared kernel (see rules below)
├── services/
│   ├── core_api/           N-tier CRUD: api → services → repositories → models
│   └── ai_api/             ports & adapters: domain → application → infrastructure → api
└── tools/scraper/          scripts, `package = false`: linted and locked here, never in an image
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

- **`travel_common` holds only what crosses a service boundary**: `Principal`, `CommonSettings`,
  domain exceptions, JWT codec, bearer extraction, the FastAPI app factory and error handlers.
  If a thing is used by one service, it belongs to that service. Never add SQLAlchemy or httpx-based
  clients to `travel_common`.
- **Settings**: each service subclasses `CommonSettings` and exposes `get_settings()` (cached);
  inject it with `Depends(get_settings)` — no module-level `settings` singleton. JWT helpers take
  `settings` explicitly. `SECRET_KEY` must be the same value in both services' `.env`.
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
  `assert` and hold fake secrets, `tools/**` keeps the old E/F-only set. Type-check with pyright
  (`[tool.pyright]`); prefer fixing the type over `# pyright: ignore`, and justify every ignore.
- **Logging**: `create_app` calls `travel_common.http.logging.configure_logging(settings.LOG_LEVEL)`
  once; modules use `logging.getLogger(__name__)`, never `print`.
