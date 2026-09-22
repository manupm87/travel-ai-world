# AGENTS.md — Kyrian World

Instructions for coding agents (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Jules, ...).
Humans: start at [README.md](README.md). This file is the **single source of truth for agents**;
tool-specific files (`.claude/CLAUDE.md`, `.claude/commands/`) only add what their tool needs.

The nearest `AGENTS.md` to the file you are editing wins:
[`src/backend/AGENTS.md`](src/backend/AGENTS.md) · [`src/backend/services/core_api/AGENTS.md`](src/backend/services/core_api/AGENTS.md) ·
[`src/backend/services/ai_api/AGENTS.md`](src/backend/services/ai_api/AGENTS.md) · [`src/frontend/AGENTS.md`](src/frontend/AGENTS.md)

## What this is

AI-powered travel planner. Static Next.js frontend + two FastAPI services:

| Path | Role | Talks to |
|---|---|---|
| `src/frontend/` | Next.js 16 static export (S3 + CloudFront on AWS) | `core_api`, `ai_api` |
| `src/backend/services/core_api/` | Google auth, users, trips CRUD, chat conversations | DynamoDB (one table, ADR 0023) |
| `src/backend/services/ai_api/` | LLM chat streaming (NVIDIA), future RAG | `core_api` (with the caller's token) |
| `src/backend/libs/travel_common/` | Shared kernel: Principal, settings, errors, JWT, app factory | — |
| `src/backend/tools/scraper/` | City data ingestion scripts (JSON output) | Google Places, Wikipedia |
| `src/backend/tools/city_corpus/` | RAG corpus builder: licence-clean city documents as JSONL (committed) | Wikivoyage, Wikipedia, OpenStreetMap, Wikidata, Open-Meteo |
| `infra/{gcp,aws}/` | Two-service deployment, one cloud per folder; **AWS is the deployed one** | — |
| `docs/` | Architecture, ADRs, runbooks, OpenAPI documents, design file | — |

Why two services: [docs/architecture/adr/0001-backend-split.md](docs/architecture/adr/0001-backend-split.md).
Why this layout: [docs/architecture/adr/0004-repository-layout.md](docs/architecture/adr/0004-repository-layout.md).
Why AWS, and how we authenticate (SSO locally, OIDC in CI): [docs/architecture/adr/0007-aws-cloud-and-auth.md](docs/architecture/adr/0007-aws-cloud-and-auth.md).
Diagram and request flows: [docs/architecture/overview.md](docs/architecture/overview.md).

## Commands (one interface for everyone: `just`)

```bash
just                # list recipes
just setup          # .env files + uv sync + npm install
just dev-core       # core_api  :8000 (hot reload; needs `just dynamodb-local` outside the devcontainer)
just dev-ai         # ai_api    :8001 (hot reload)
just dev-frontend   # Next.js   :3000
just dynamodb-local # in-memory DynamoDB :8002 (moto) for dev-core/dev-ai without Docker
just lint           # ruff + pyright (backend, scripts) + eslint
just test           # every backend package + frontend unit tests
just test-core / test-ai / test-common / test-corpus / test-frontend / test-e2e
just contracts      # export OpenAPI docs + regenerate frontend types (run after changing any schema/route)
just docs-check     # documentation hygiene
just docker-up      # backend only: proxy :8080 + core_api + ai_api + DynamoDB Local + PostgreSQL (copy source) (no Node)
just stack-up       # the stack as deployed: frontend export + the above on one origin :8080
just build-stack    # only the export for :8080 (what stack-up runs before docker-up)
just scrape         # run the city scraper (needs GOOGLE_API_KEY in its .env)
just corpus         # build the RAG corpus (Wikivoyage, Wikipedia, OSM, Wikidata, Open-Meteo → tools/city_corpus/data/<city>/)
just corpus-discover "<City>"  # draft a new city's TOML; the whole flow: docs/runbooks/add-city.md (Claude: /add-city)
just aws-login      # AWS via IAM Identity Center (devcontainer); never access keys
```

Windows: `winget install Casey.Just` and run the recipes from Git Bash or WSL (they are POSIX shell).
`just test-core` needs a non-empty `SECRET_KEY` (see `src/backend/services/core_api/.env.example`); DynamoDB is
moto in process, and only its `copy-from-postgres` test uses PostgreSQL (skipped without it).

## Non-negotiable rules

1. **Run the checks before you finish**: `just lint`, the tests of every package you touched, and
   `just contracts` whenever a Pydantic schema or route changed (CI rejects drift).
2. **Keep the service boundary**: `ai_api` never imports `core_api` or SQLAlchemy; `core_api` never
   imports `ai_api`. They talk over HTTP. Shared code goes to `travel_common` only if both need it.
3. **Errors are domain errors**: raise `travel_common.exceptions.*` from services; never
   `HTTPException`; endpoints contain no `if not x: raise 404`.
4. **Identity is `Principal`**, never an ORM row, in any endpoint or use case.
5. **No secrets in code or docs.** `.env.example` files document variables; real values live in `.env` (ignored).
6. **Frontend strings go through i18n** (`useLanguage()`); components never call `fetch` directly
   (only `src/frontend/src/services/`).
7. **Docs travel with the change**: update the nearest `README.md`/`AGENTS.md`; add an ADR under
   `docs/architecture/adr/` for any decision that changes structure, contracts or infrastructure.
8. **Never edit generated files by hand**: `src/frontend/src/types/generated/`, `docs/api/*.openapi.json`, `uv.lock`, lockfiles.
9. **Top-level layout is fixed**: code under `src/`, infrastructure under `infra/`, docs under
   `docs/`. Do not add folders at the root; if a path moves, update the places listed in ADR 0004.

## Conventions

- Python 3.12, `uv` workspace at `src/backend/` (one lockfile), ruff (line length 88; rules E4/E7/E9/F +
  I, UP, B, SIM, N, RUF, ASYNC, S — see `src/backend/pyproject.toml`) and pyright (standard mode) over
  `libs/`, `services/` and `tools/city_corpus`. The scraper keeps the E/F-only policy.
- TypeScript strict, Tailwind v4 (CSS custom properties, no `tailwind.config.js`), Vitest, Playwright.
- Commits: conventional prefixes (`feat`, `fix`, `refactor`, `build`, `ci`, `docs`, `infra`, `test`, `chore`).
- Branches: `<type>/TRA-<n>-<short-title>` (e.g. `feat/TRA-123-trip-list`): the same prefixes as
  commits, the Linear issue key, a lowercase slug. Every change starts from a Linear issue; if
  there is none, ask for one (or create it through the Linear MCP) before branching. The PR body
  links it (`Closes TRA-123`). Claude Code enforces the pattern with a hook (`.claude/hooks/`).
- PRs follow `.github/pull_request_template.md`; CI is `.github/workflows/pr.yml` (path-filtered jobs).

## How work is delivered (default)

Every change bigger than a few lines goes through the same four roles. One session may play
several of them, but the hand-offs are explicit and the brief is written down before any code.

1. **Audit and brief** — the most capable model available reads the code involved, takes the design
   decisions and writes an agent-ready brief: outcome, decisions taken (not to be reopened), files to
   touch, tests, docs, acceptance criteria. The Linear issue carries the outcome and the acceptance
   list; the brief adds the details.
2. **Implement** — a cheaper capable model (Opus) works in its own git worktree on the issue branch,
   runs the checks and opens the PR (`Closes TRA-<n>`).
3. **Review** — independent reviewers (Sonnet), one lens each: correctness, contracts and tests,
   UX / copy / accessibility. A finding names file and line and says what to change.
4. **Fix and ship** — the implementer's model applies the confirmed findings and watches CI; the main
   session merges when CI is green. Merging, `terraform apply` and production checks stay human
   decisions whenever the tooling asks for one.

Runbook (brief template, how to run and resume a wave, what the human does):
[docs/runbooks/agent-delivery.md](docs/runbooks/agent-delivery.md). Claude Code runs the wave with
`/deliver-issue TRA-<n>` (`.claude/workflows/kyrian-wave.js`).

## Where things live

- Auth flow, chat flow, service-to-service calls → `docs/architecture/overview.md`
- Local dev, Docker, deploy, release, agent delivery → `docs/runbooks/`
- API contracts (generated) → `docs/api/*.openapi.json` and `src/frontend/src/types/generated/`
- Cloud deployment → `infra/README.md`, then `infra/<cloud>/README.md`
- Design file `docs/design/ideas.pen` → only through Pencil MCP tools (Claude); never open with file tools.
