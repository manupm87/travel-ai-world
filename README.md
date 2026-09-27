# Kyrian World

> AI-powered travel planning. Tell us where you want to go and the AI drafts a personalised,
> day-by-day itinerary, streamed in real time.

Live site: <https://kyrian-world.com> (static frontend on S3 + CloudFront; the API and the
sign-in come from the same domain: `infra/aws/`, ADR 0009; the data lives in DynamoDB, ADR 0023).

## What is inside

| Path | What | Stack |
|---|---|---|
| [`src/frontend/`](src/frontend/README.md) | Web app: landing, sign-in, trips home (`/dashboard/`), AI planner (`/plan/`), admin console (`/admin/`) | Next.js 16 (static export) · React 19 · Tailwind v4 · TypeScript |
| [`src/backend/services/core_api/`](src/backend/services/core_api/README.md) | Users, trips, conversations, admin reads; verifies Cognito tokens (issues its own JWT only in local mode) | FastAPI · DynamoDB (boto3) |
| [`src/backend/services/ai_api/`](src/backend/services/ai_api/README.md) | Trip planner (typed SSE, ADR 0015), card details, chat, admin reads over the turn traces; Bedrock deployed, NVIDIA locally; RAG over S3 Vectors (ADR 0014) | FastAPI · boto3 · httpx · SSE |
| [`src/backend/libs/travel_common/`](src/backend/libs/travel_common/README.md) | Shared kernel: identity, settings, errors, token verification, DynamoDB access, app factory | Pydantic · PyJWT · boto3 |
| [`src/backend/tools/city_corpus/`](src/backend/tools/city_corpus/README.md) | The RAG corpus: licence-clean city documents as committed JSONL, one folder per city | httpx · Wikivoyage · Wikipedia · OpenStreetMap · Wikidata |
| [`src/backend/tools/scraper/`](src/backend/tools/scraper/README.md) | Legacy Madrid datasets (Google Places, transport, Wikipedia); not used by the planner | requests · BeautifulSoup · Google Places |
| [`src/backend/tools/vector_store_bench/`](src/backend/tools/vector_store_bench/README.md) | Vector store spike (TRA-151, Qdrant vs S3 Vectors); frozen, never deployed | numpy · qdrant-client |
| [`infra/`](infra/README.md) | Terraform: [`aws/`](infra/aws/README.md) is what is deployed; [`gcp/`](infra/gcp/README.md) still validates but is not ported to DynamoDB | Terraform |
| [`docs/`](docs/README.md) | Architecture overview, ADRs, runbooks, generated OpenAPI documents, design file | Markdown · Mermaid |

Why two backend services and how they talk: [architecture overview](docs/architecture/overview.md).

```text
travel-ai-world/
├── src/             # frontend/ (Next.js) · backend/ (uv workspace: libs, services, tools)
├── infra/           # Terraform: aws/ (deployed), gcp/ (not ported to DynamoDB)
├── docs/            # architecture/, runbooks/, api/ (generated), design/
├── scripts/         # check_docs.py (docs CI) · release.py (version bump + GitHub release)
├── .github/         # PR checks, image publishing, frontend deploy (S3 + CloudFront), manual backend deploy
├── .devcontainer/   # VS Code container: toolchain + DynamoDB Local
├── .claude/         # Claude Code: CLAUDE.md (imports AGENTS.md) and slash commands
├── justfile         # the one task runner for humans, CI and agents
├── AGENTS.md        # rules for coding agents
└── README.md
```

## Quick start

Prerequisites: Node.js 24 (`.nvmrc`), Python 3.12 (`.python-version`) + [uv](https://github.com/astral-sh/uv),
[just](https://just.systems), a Google OAuth client ID and an
NVIDIA API key for the chat.

```bash
just setup          # .env files from templates + uv sync + npm install
just dynamodb-local # in-memory DynamoDB :8002 for core_api (the devcontainer brings its own)
just dev-core       # core_api    http://localhost:8000/docs
just dev-ai         # ai_api      http://localhost:8001/api/v1/ai/docs
just dev-frontend   # frontend    http://localhost:3000
just lint · just test · just contracts · just docs-check
just docker-up      # nginx :8080 + core_api + ai_api + DynamoDB Local from built images
just stack-up       # the same plus the frontend export, on one origin http://localhost:8080 (as in prod)
```

`just` alone lists every recipe. Step by step, including the variables to fill in:
[local development runbook](docs/runbooks/local-dev.md). Windows: `winget install Casey.Just`.

## How it works

- **Sign-in** is Google only. Deployed, a Cognito user pool with Google as identity provider
  issues the tokens and both services verify them offline (ADR 0009); locally
  (`AUTH_MODE=local`) `core_api` verifies a Google ID token and issues its own JWT.
- **Planning** goes to `ai_api` (`POST /api/v1/ai/planner`), which validates the token
  statelessly and streams typed events (ADR 0015) grounded in the city corpus. The browser saves
  the trip through `core_api`. Without an AI API URL the page plays a recorded demo session.
- **Contracts** are generated: `just contracts` exports each service's OpenAPI document to
  `docs/api/` and regenerates the frontend's TypeScript types; CI fails on drift.

## CI/CD

| Workflow | Trigger | Does |
|---|---|---|
| `pr.yml` | pull request | path-filtered jobs: ruff, per-package tests (moto for DynamoDB, no database server), Docker builds, Compose stack e2e (export + APIs on one origin, signed in with a minted token), contract drift, eslint + Vitest + Playwright + `next build`, docs hygiene |
| `deploy.yml` | push to `main` touching `src/frontend/` | static export → S3 + CloudFront invalidation (AWS) |
| `backend-images.yml` | push to `main` touching `src/backend/` | publishes `ghcr.io/manupm87/travel-ai-world/{core-api,ai-api}` |
| `deploy-backend.yml` | manual | copies the images to GCP or AWS and runs Terraform (plan by default) |

Runbooks: [docker](docs/runbooks/docker.md) · [deploy](docs/runbooks/deploy.md) ·
[release](docs/runbooks/release.md).

## Roadmap

- [x] Landing page, EN/ES i18n, light/dark theme
- [x] Google sign-in (Cognito in production), saved trips listed on the home and reopened in the planner
- [x] Backend split into `core_api` and `ai_api` with a shared library; AI chat streaming
- [x] CI/CD: path-filtered checks, contract checks, image publishing, S3 + CloudFront deploy, Terraform
- [x] Trips backed by `core_api`: one city each, a phase derived from the dates, read-only once they start (ADR 0019)
- [x] Structured itineraries from the planner (typed SSE, ADR 0015), saved through `core_api`
- [x] RAG over the city corpus (`tools/city_corpus` → S3 Vectors, ADR 0014)
- [x] Data on DynamoDB (ADR 0023); turn traces and an admin console (ADR 0024)
- [ ] PDF export
