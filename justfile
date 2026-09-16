# Travel AI World — task runner (humans, CI and agents use the same commands).
# Install: https://just.systems  (winget install Casey.Just / brew install just / cargo install just)
#
#   just            list recipes
#   just setup      first-time setup
#   just dev-core   run core_api with hot reload
#
# Recipes are POSIX shell. On Windows run them from Git Bash (bundled with Git
# for Windows) or WSL; PowerShell is not supported.

set shell := ["bash", "-euo", "pipefail", "-c"]

backend := "src/backend"
core := "src/backend/services/core_api"
ai := "src/backend/services/ai_api"
common := "src/backend/libs/travel_common"
scraper := "src/backend/tools/scraper"
frontend := "src/frontend"

# List available recipes
default:
    @just --list --unsorted

# ── Setup ────────────────────────────────────────────────────────────────────

# Create .env files from templates and install every dependency
setup:
    @[ -f {{core}}/.env ] || cp {{core}}/.env.example {{core}}/.env
    @[ -f {{ai}}/.env ] || cp {{ai}}/.env.example {{ai}}/.env
    @[ -f {{frontend}}/.env.local ] || cp {{frontend}}/.env.example {{frontend}}/.env.local
    @[ -f {{scraper}}/.env ] || cp {{scraper}}/.env.example {{scraper}}/.env
    cd {{backend}} && uv sync --all-packages
    cd {{frontend}} && npm install
    @echo "Setup complete. Fill in SECRET_KEY (same value in both backend .env files), GOOGLE_* and NVIDIA_API_KEY."

# ── Run ──────────────────────────────────────────────────────────────────────

# core_api with hot reload on :8000
dev-core:
    cd {{core}} && uv run uvicorn core_api.main:app --reload --host 0.0.0.0 --port 8000

# ai_api with hot reload on :8001
dev-ai:
    cd {{ai}} && uv run uvicorn ai_api.main:app --reload --host 0.0.0.0 --port 8001

# Next.js dev server on :3000
dev-frontend:
    cd {{frontend}} && npm run dev

# Run the city scraper (needs GOOGLE_API_KEY in {{scraper}}/.env); output in {{scraper}}/data/
scrape:
    cd {{scraper}} && uv run python main.py

# ── Quality ──────────────────────────────────────────────────────────────────

# Lint backend (ruff, incl. scripts/) and frontend (eslint)
lint: lint-backend lint-frontend

# ruff (backend workspace + repo scripts, backend config) and pyright
lint-backend:
    cd {{backend}} && uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
    cd {{backend}} && uv run pyright

# Static type check of the backend packages (pyright, standard mode)
typecheck:
    cd {{backend}} && uv run pyright

# eslint
lint-frontend:
    cd {{frontend}} && npm run lint

# Auto-format the backend and the repo scripts
format:
    cd {{backend}} && uv run ruff format . ../../scripts && uv run ruff check --fix . ../../scripts

# All tests: backend packages + frontend unit tests
test: test-backend test-frontend

# Every backend package (needs PostgreSQL for core_api)
test-backend: test-common test-core test-ai

# travel_common unit tests
test-common:
    cd {{common}} && uv run pytest -q

# core_api tests (PostgreSQL required; creates <DB_NAME>_test)
test-core:
    cd {{core}} && uv run pytest -q

# ai_api tests (no network, no key)
test-ai:
    cd {{ai}} && uv run pytest -q

# Frontend unit tests (vitest)
test-frontend:
    cd {{frontend}} && npm run test:unit

# Playwright E2E smoke tests against the dev server
test-e2e:
    cd {{frontend}} && npx playwright test

# Playwright E2E over the static export (what CI's `frontend` job runs)
test-e2e-static:
    cd {{frontend}} && npm run test:e2e:static

# Playwright E2E against the running Compose stack on :8080, signed in with a minted token
# (what CI's `e2e-stack` job runs): just stack-up && just seed you@example.com &&
# E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
test-e2e-stack:
    cd {{frontend}} && npm run test:e2e:stack

# ── Contracts & docs ─────────────────────────────────────────────────────────

# Export OpenAPI documents and regenerate the frontend's TypeScript types
contracts:
    cd {{backend}} && uv run python scripts/export_openapi.py
    cd {{frontend}} && npm run types:generate

# Fail if OpenAPI documents or generated types are stale (what CI runs)
contracts-check:
    cd {{backend}} && uv run python scripts/export_openapi.py --check
    cd {{frontend}} && npm run types:check

# Documentation hygiene: required files present, links resolve
docs-check:
    python3 scripts/check_docs.py

# ── Infrastructure ───────────────────────────────────────────────────────────

# terraform fmt over both clouds (writes)
infra-fmt:
    terraform fmt -recursive infra

# Fail if any Terraform file is not formatted (what CI runs)
infra-fmt-check:
    terraform fmt -check -recursive -diff infra

# terraform init (no backend) + validate for one root: just infra-validate gcp|aws|aws/bootstrap
infra-validate cloud:
    cd infra/{{cloud}} && terraform init -backend=false -input=false >/dev/null && terraform validate

# Log in to AWS through IAM Identity Center (profile from AWS_PROFILE / ~/.aws/config)
aws-login:
    aws sso login
    aws sts get-caller-identity

# ── Database ─────────────────────────────────────────────────────────────────

# Apply core_api migrations
migrate:
    cd {{core}} && uv run alembic upgrade head

# Autogenerate a migration after changing core_api models: just migration "add x"
migration message:
    cd {{core}} && uv run alembic revision --autogenerate -m "{{message}}"

# Load the four demo trips for an account (created if missing; re-runs replace them): just seed you@example.com
seed email:
    cd {{core}} && uv run python -m core_api.ops seed {{email}}

# Print a local-mode JWT for an existing account (seed it first), to sign in without Google:
# E2E_TOKEN=$(just dev-token you@example.com). Dev-only: not an `ops` command, never on /events.
dev-token email:
    @cd {{core}} && uv run --quiet python -m core_api.devtools token {{email}}

# ── Build & Docker ───────────────────────────────────────────────────────────

# Production static export of the frontend
build:
    cd {{frontend}} && npm run build

# Build both backend images locally
docker-build:
    cd {{backend}} && docker build --build-arg SERVICE=core_api -t travel-ai-world/core-api:local .
    cd {{backend}} && docker build --build-arg SERVICE=ai_api -t travel-ai-world/ai-api:local .

# Backend-only stack: proxy :8080 + core_api + ai_api + PostgreSQL (no Node needed).
# The proxy serves whatever is in {{frontend}}/out; without a build "/" answers 404
# and /api/* still works. mkdir keeps the bind-mount source owned by you, not root.
docker-up:
    mkdir -p {{frontend}}/out
    cd {{backend}} && docker compose --env-file services/core_api/.env up --build -d

# Stop the Compose stack
docker-down:
    cd {{backend}} && docker compose down

# Frontend export for the Compose origin: the API is same-origin on :8080, so
# NEXT_PUBLIC_AI_API_URL is emptied (it defaults to the core URL, ADR 0003).
# Command-line variables override .env.local; the rest (Google client id) still comes from it.
build-stack:
    cd {{frontend}} && NEXT_PUBLIC_API_URL=http://localhost:8080 NEXT_PUBLIC_AI_API_URL= npm run build

# Full stack as deployed on http://localhost:8080: export + proxy + core_api + ai_api + PostgreSQL.
# `next build` deletes and recreates out/, so a proxy that was already running would keep the
# old, unlinked directory (404 on every page): recreate it so the bind mount is the new one.
stack-up: build-stack docker-up
    cd {{backend}} && docker compose --env-file services/core_api/.env up -d --force-recreate --no-deps proxy

# Stop the full stack (same as docker-down)
stack-down: docker-down

# Tail logs: just docker-logs core_api | ai_api | proxy
docker-logs service="core_api":
    cd {{backend}} && docker compose logs -f {{service}}

# ── Release ──────────────────────────────────────────────────────────────────

# Bump the version in every manifest and commit (patch|minor|major); feature branches only
version bump="patch":
    python3 scripts/release.py bump {{bump}}

# Tag vX.Y.Z on main and create the GitHub release (needs gh)
release:
    python3 scripts/release.py publish

# Remove virtualenvs, node_modules and build output
clean:
    rm -rf {{backend}}/.venv {{frontend}}/node_modules {{frontend}}/.next {{frontend}}/out
