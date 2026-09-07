# Travel AI World ✈️

> AI-powered travel planning. Tell us where you want to go and the AI drafts a personalised,
> day-by-day itinerary, streamed in real time.

Live site: <https://manupm87.github.io/travel-ai-world/> (static frontend; backend features
switch on when an API URL is configured).

## What is inside

| Path | What | Stack |
|---|---|---|
| [`src/frontend/`](src/frontend/README.md) | Web app: landing, Google sign-in, dashboard, itinerary viewer, AI planner | Next.js 16 (static export) · React 19 · Tailwind v4 · TypeScript |
| [`src/backend/services/core_api/`](src/backend/services/core_api/README.md) | Google OAuth, users, trips CRUD, JWT issuing | FastAPI · SQLAlchemy 2 · PostgreSQL · Alembic |
| [`src/backend/services/ai_api/`](src/backend/services/ai_api/README.md) | Chat streaming over NVIDIA-hosted models; future RAG | FastAPI · httpx · SSE |
| [`src/backend/libs/travel_common/`](src/backend/libs/travel_common/README.md) | Shared kernel: identity, settings, errors, JWT, app factory | Pydantic · PyJWT |
| [`src/backend/tools/scraper/`](src/backend/tools/scraper/README.md) | City data ingestion (points of interest, transport, Wikipedia articles) as JSON | requests · BeautifulSoup · Google Places |
| [`infra/`](infra/README.md) | Two-service deployment, one folder per cloud: [`gcp/`](infra/gcp/README.md), [`aws/`](infra/aws/README.md) | Terraform |
| [`docs/`](docs/README.md) | Architecture overview, ADRs, runbooks, generated OpenAPI documents, design file | Markdown · Mermaid |

Why two backend services and how they talk: [architecture overview](docs/architecture/overview.md).

```text
travel-ai-world/
├── src/             # frontend/ (Next.js) · backend/ (uv workspace: libs, services, tools)
├── infra/           # Terraform: gcp/, aws/ (alternatives, pick one)
├── docs/            # architecture/, runbooks/, api/ (generated), design/
├── scripts/         # check_docs.py (docs CI) · release.py (version bump + GitHub release)
├── .github/         # PR checks, image publishing, Pages deploy, manual backend deploy
├── .devcontainer/   # VS Code container: toolchain + PostgreSQL
├── .claude/         # Claude Code: CLAUDE.md (imports AGENTS.md) and slash commands
├── justfile         # the one task runner for humans, CI and agents
├── AGENTS.md        # rules for coding agents
└── README.md
```

## Quick start

Prerequisites: Node.js 24 (`.nvmrc`), Python 3.12 (`.python-version`) + [uv](https://github.com/astral-sh/uv),
[just](https://just.systems), PostgreSQL 16 (or the devcontainer), a Google OAuth client ID and an
NVIDIA API key for the chat.

```bash
just setup          # .env files from templates + uv sync + npm install
just migrate        # core_api schema
just dev-core       # core_api    http://localhost:8000/docs
just dev-ai         # ai_api      http://localhost:8001/api/v1/ai/docs
just dev-frontend   # frontend    http://localhost:3000
just lint · just test · just contracts · just docs-check
just docker-up      # nginx :8080 + core_api + ai_api + PostgreSQL from built images
```

`just` alone lists every recipe. Step by step, including the variables to fill in:
[local development runbook](docs/runbooks/local-dev.md). Windows: `winget install Casey.Just`.

## How it works

- **Sign-in** is Google OAuth only. The browser gets a Google ID token, `core_api` verifies it,
  upserts the user and returns a JWT carrying `sub`, `email` and `role`.
- **Chat** goes to `ai_api` (`POST /api/v1/ai/chat`), which validates the JWT statelessly and
  streams the model's answer as Server-Sent Events. Without an API URL the UI shows a static
  "coming soon" mode.
- **Contracts** are generated: `just contracts` exports each service's OpenAPI document to
  `docs/api/` and regenerates the frontend's TypeScript types; CI fails on drift.

## CI/CD

| Workflow | Trigger | Does |
|---|---|---|
| `pr.yml` | pull request | path-filtered jobs: ruff, per-package tests (PostgreSQL for `core_api`), Docker builds, contract drift, eslint + Vitest + Playwright + `next build`, docs hygiene |
| `deploy.yml` | push to `main` | static export → GitHub Pages |
| `backend-images.yml` | push to `main` touching `src/backend/` | publishes `ghcr.io/manupm87/travel-ai-world/{core-api,ai-api}` |
| `deploy-backend.yml` | manual | copies the images to GCP or AWS and runs Terraform (plan by default) |

Runbooks: [docker](docs/runbooks/docker.md) · [deploy](docs/runbooks/deploy.md) ·
[release](docs/runbooks/release.md).

## Roadmap

- [x] Landing page, EN/ES i18n, light/dark theme
- [x] Google OAuth 2.0, dashboard and itinerary viewer (mock trips today)
- [x] Backend split into `core_api` and `ai_api` with a shared library; AI chat streaming
- [x] CI/CD: path-filtered checks, contract checks, image publishing, Pages deploy, Terraform for two clouds
- [ ] Dashboard and viewer backed by `core_api` trips instead of mocks
- [ ] Structured itineraries from chat, saved through `core_api`
- [ ] RAG over the scraped city data (`ai_api` `Retriever` port)
- [ ] PDF export
