# Kyrian World

> AI-powered travel planning. Tell us where you want to go and the AI drafts a personalised,
> day-by-day itinerary, streamed in real time.

Live site: <https://kyrian-world.com> (static frontend on S3 + CloudFront; the API and the
sign-in come from the same domain: `infra/aws/`, ADR 0009; the data lives in DynamoDB, ADR 0023).

## What is inside

| Path | What | Stack |
|---|---|---|
| [`src/frontend/`](src/frontend/README.md) | Web app: landing, sign-in, trips home (`/dashboard/`), AI planner (`/plan/`), admin console (`/admin/`) | Next.js 16 (static export) · React 19 · Tailwind v4 · TypeScript |
| [`src/backend/services/core_api/`](src/backend/services/core_api/README.md) | Users, trips, the access list, admin reads; verifies Cognito tokens (issues its own JWT only in local mode) | FastAPI · DynamoDB (boto3) |
| [`src/backend/services/ai_api/`](src/backend/services/ai_api/README.md) | Trip planner (typed SSE, ADR 0015), card details, admin reads over the turn traces; Bedrock deployed, NVIDIA locally; RAG over S3 Vectors (ADR 0014) | FastAPI · boto3 · httpx · SSE |
| [`src/backend/libs/travel_common/`](src/backend/libs/travel_common/README.md) | Shared kernel: identity, settings, errors, token verification, DynamoDB access, app factory | Pydantic · PyJWT · boto3 |
| [`src/backend/tools/city_corpus/`](src/backend/tools/city_corpus/README.md) | The RAG corpus: licence-clean city documents as committed JSONL, one folder per city | httpx · Wikivoyage · Wikipedia · OpenStreetMap · Wikidata |
| [`infra/`](infra/README.md) | Terraform for the AWS deployment ([`aws/`](infra/aws/README.md)) | Terraform |
| [`docs/`](docs/README.md) | Architecture overview, ADRs, runbooks, generated OpenAPI documents, design file | Markdown · Mermaid |

Why two backend services and how they talk: [architecture overview](docs/architecture/overview.md).

```text
travel-ai-world/
├── src/             # frontend/ (Next.js) · backend/ (uv workspace: libs, services, tools)
├── infra/           # Terraform: aws/ (the deployment) and aws/bootstrap/ (state + CI role)
├── docs/            # architecture/, runbooks/, api/ (generated), design/
├── scripts/         # check_docs.py (docs CI) · release.py (version bump + GitHub release)
├── .github/         # PR checks, image publishing, frontend deploy (S3 + CloudFront), manual backend deploy
├── .devcontainer/   # VS Code container: toolchain + DynamoDB Local
├── .claude/         # Claude Code: CLAUDE.md (imports AGENTS.md), slash commands, branch-name hook, kyrian-wave workflow
├── justfile         # the one task runner for humans, CI and agents
├── AGENTS.md        # rules for coding agents
└── README.md
```

## Quick start

**The development environment is the devcontainer** (Windows, macOS or Linux): Docker Desktop
(on Windows with the WSL 2 backend), VS Code and its Dev Containers extension. Open the repo →
"Reopen in Container". It brings the whole toolchain (Node 24, Python 3.12 + uv, just, AWS CLI,
Terraform, Playwright's Chromium) and DynamoDB Local, and runs `just setup` on first creation.
Then, in three terminals of the container:

```bash
just dev-core       # core_api  http://localhost:8000/docs
just dev-ai         # ai_api    http://localhost:8001/api/v1/ai/docs
just dev-frontend   # frontend  http://localhost:3000
just dev-token you@example.com --browser   # sign in without Google: paste the line in DevTools
just lint · just test · just contracts · just docs-check
```

Nothing else is needed to run the app and its tests: no Google client, no API key, no AWS account
(those only add the real Google button and the live planner). Without the container, the same
recipes run on the host with Node 24, Python 3.12 + uv and just installed, plus a fourth terminal
for `just dynamodb-local`; on Windows from Git Bash, never PowerShell. Docker Compose
(`just stack-up`, the stack as deployed on one origin) runs on the host, since the container has no
Docker. Step by step: [local development runbook](docs/runbooks/local-dev.md). `just` alone lists
every recipe.

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
| `deploy-backend.yml` | manual | copies the images into ECR and runs Terraform on `infra/aws` (plan by default) |

Runbooks: [docker](docs/runbooks/docker.md) · [deploy](docs/runbooks/deploy.md) ·
[release](docs/runbooks/release.md).

## Roadmap

- [x] Landing page, EN/ES i18n, light/dark theme
- [x] Google sign-in (Cognito in production), saved trips listed on the home and reopened in the planner
- [x] Backend split into `core_api` and `ai_api` with a shared library; the planner streams over SSE
- [x] CI/CD: path-filtered checks, contract checks, image publishing, S3 + CloudFront deploy, Terraform
- [x] Trips backed by `core_api`: one city each, a phase derived from the dates, read-only once they start (ADR 0019)
- [x] Structured itineraries from the planner (typed SSE, ADR 0015), saved through `core_api`
- [x] RAG over the city corpus (`tools/city_corpus` → S3 Vectors, ADR 0014)
- [x] Data on DynamoDB (ADR 0023); turn traces and an admin console (ADR 0024)
- [ ] PDF export
