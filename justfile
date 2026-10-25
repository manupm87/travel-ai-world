# Kyrian World — task runner (humans, CI and agents use the same commands).
# Install: https://just.systems  (winget install Casey.Just / brew install just / cargo install just)
#
#   just            list recipes
#   just setup      first-time setup
#   just dev-core   run core_api with hot reload
#
# The development environment is the devcontainer (.devcontainer/). On a host,
# recipes are POSIX shell: on Windows run them from Git Bash (bundled with Git
# for Windows) or WSL; PowerShell is not supported.

set shell := ["bash", "-euo", "pipefail", "-c"]

backend := "src/backend"
core := "src/backend/services/core_api"
ai := "src/backend/services/ai_api"
common := "src/backend/libs/travel_common"
corpus := "src/backend/tools/city_corpus"
frontend := "src/frontend"

# List available recipes
default:
    @just --list --unsorted

# Create .env files from templates and install every dependency
setup:
    @[ -f {{core}}/.env ] || cp {{core}}/.env.example {{core}}/.env
    @[ -f {{ai}}/.env ] || cp {{ai}}/.env.example {{ai}}/.env
    @[ -f {{frontend}}/.env.local ] || cp {{frontend}}/.env.example {{frontend}}/.env.local
    cd {{backend}} && uv sync --all-packages
    @just _secret-key
    cd {{frontend}} && npm install
    @echo "Setup complete. Everything else in the .env files is optional: docs/runbooks/local-dev.md."

# Fill an empty SECRET_KEY in the backend .env files with one key, the same in both (they verify the same tokens)
[private]
_secret-key:
    @if grep -q '^SECRET_KEY=""$' {{core}}/.env {{ai}}/.env; then \
      key=$(grep -h '^SECRET_KEY=".\+"$' {{core}}/.env {{ai}}/.env | head -1 | cut -d'"' -f2 || true); \
      [ -n "$key" ] || key=$(cd {{backend}} && uv run python -c 'import secrets; print(secrets.token_hex(32))'); \
      for f in {{core}}/.env {{ai}}/.env; do sed -i.bak "s|^SECRET_KEY=\"\"$|SECRET_KEY=\"$key\"|" "$f" && rm -f "$f.bak"; done; \
      echo "SECRET_KEY written to both backend .env files"; \
    elif [ "$(grep -h '^SECRET_KEY=' {{core}}/.env {{ai}}/.env | sort -u | wc -l)" -gt 1 ]; then \
      echo "warning: SECRET_KEY differs between the backend .env files; tokens from core_api will fail in ai_api" >&2; \
    fi

# core_api with hot reload on :8000 (needs DynamoDB: `just dynamodb-local` outside the devcontainer)
dev-core:
    cd {{core}} && uv run uvicorn core_api.main:app --reload --host 0.0.0.0 --port 8000

# ai_api with hot reload on :8001
dev-ai:
    cd {{ai}} && uv run uvicorn ai_api.main:app --reload --host 0.0.0.0 --port 8001

# Next.js dev server on :3000
dev-frontend:
    cd {{frontend}} && npm run dev

# In-memory DynamoDB (moto) on :8002 for dev-core / dev-ai without Docker
dynamodb-local:
    cd {{backend}} && uv run moto_server -H 0.0.0.0 -p 8002

# Build a city's corpus (downloads cached in .cache/), gate it with its report, refresh the manifest
corpus city="budapest":
    cd {{corpus}} && uv run python -m city_corpus build {{city}}
    cd {{corpus}} && uv run python -m city_corpus report {{city}}
    just corpus-manifest

# Rewrite data/cities.json and copy it into ai_api's package data (CI fails when they differ)
corpus-manifest:
    cd {{corpus}} && uv run python -m city_corpus manifest
    cp {{corpus}}/data/cities.json {{ai}}/ai_api/data/cities.json

# Readiness report of a built corpus; exit 1 below a threshold (flags="--no-gate" only prints)
corpus-report city="budapest" *flags="":
    cd {{corpus}} && uv run python -m city_corpus report {{city}} {{flags}}

# Draft a new city's <slug>.draft.toml from open sources (flow: docs/runbooks/add-city.md)
corpus-discover name:
    cd {{corpus}} && uv run python -m city_corpus discover "{{name}}"

# Sync a city's corpus into the S3 Vectors index, ADR 0014 (AWS session; --dry-run, --limit N)
index city="budapest" *flags="":
    cd {{ai}} && uv run python -m ai_api.indexing ../../tools/city_corpus/data/{{city}}/documents.jsonl {{flags}}

# Planner session on the real NVIDIA model over a city's committed corpus (needs NVIDIA_API_KEY)
planner-smoke city="budapest" lang="es" *flags="":
    cd {{ai}} && uv run python tests/manual/planner_smoke.py --city {{city}} --lang {{lang}} {{flags}}

# Recall@5/10 and MRR of the deployed index; no city = every city (needs an AWS session)
eval-retrieval city="":
    cd {{ai}} && uv run python tests/manual/retrieval_eval.py {{city}}

# Groundedness and relevance of the planner's answers, graded by a judge model (AWS, about 1 USD)
eval-answers city="" *flags="":
    cd {{ai}} && uv run python tests/manual/answer_eval.py {{city}} {{flags}}

# Scripted multi-turn planner conversations, graded (docs/architecture/agent-evaluation.md)
eval-conversations city="" *flags="":
    cd {{ai}} && uv run python tests/manual/conversation_eval.py {{city}} {{flags}}

# Lint backend (ruff, incl. scripts/) and frontend (eslint)
lint: lint-backend lint-frontend

# ruff (backend workspace + repo scripts, backend config) and pyright
lint-backend:
    cd {{backend}} && uv run ruff check . ../../scripts && uv run ruff format --check . ../../scripts
    cd {{backend}} && uv run pyright

# eslint
lint-frontend:
    cd {{frontend}} && npm run lint

# Auto-format the backend and the repo scripts
format:
    cd {{backend}} && uv run ruff format . ../../scripts && uv run ruff check --fix . ../../scripts

# All tests: backend packages + frontend unit tests
test: test-backend test-frontend

# Every backend package
test-backend: test-common test-core test-ai test-corpus

# travel_common unit tests
test-common:
    cd {{common}} && uv run pytest -q

# core_api tests (DynamoDB on moto, in process; no database server needed)
test-core:
    cd {{core}} && uv run pytest -q

# ai_api tests (no network, no key)
test-ai:
    cd {{ai}} && uv run pytest -q

# city_corpus tests (fixtures only, no network)
test-corpus:
    cd {{corpus}} && uv run pytest -q

# Frontend unit tests (vitest)
test-frontend:
    cd {{frontend}} && npm run test:unit

# Playwright E2E smoke tests against the dev server
test-e2e:
    cd {{frontend}} && npx playwright test

# Playwright E2E over the static export (what CI's `frontend` job runs)
test-e2e-static:
    cd {{frontend}} && npm run test:e2e:static

# Playwright E2E against the Compose stack on :8080, signed in with E2E_TOKEN from dev-token
test-e2e-stack:
    cd {{frontend}} && npm run test:e2e:stack

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

# terraform fmt over infra/ (writes)
infra-fmt:
    terraform fmt -recursive infra

# Fail if any Terraform file is not formatted (what CI runs)
infra-fmt-check:
    terraform fmt -check -recursive -diff infra

# terraform init (no backend) + validate for one root: just infra-validate aws|aws/bootstrap
infra-validate cloud:
    cd infra/{{cloud}} && terraform init -backend=false -input=false >/dev/null && terraform validate

# Log in to AWS through IAM Identity Center (profile from AWS_PROFILE / ~/.aws/config)
aws-login:
    aws sso login
    aws sts get-caller-identity

# Cognito username of a signed-in account, for admin_usernames in infra/aws/admins.auto.tfvars
cognito-username email:
    aws cognito-idp list-users --user-pool-id "$(cd infra/aws && terraform output -raw cognito_user_pool_id)" --filter "email = \"{{email}}\"" --query 'Users[].Username' --output text

# Print a local-mode JWT for an account, created when new (--admin: administrator; --browser: a DevTools line that signs the browser in)
dev-token email *flags="":
    @cd {{core}} && uv run --quiet python -m core_api.devtools token {{email}} {{flags}}

# Put an email on the local access list, ADR 0026 (--limit N, 0 = unlimited)
dev-grant email *flags="":
    @cd {{core}} && uv run --quiet python -m core_api.devtools grant {{email}} {{flags}}


# Production static export of the frontend
build:
    cd {{frontend}} && npm run build

# Build both backend images locally
docker-build:
    cd {{backend}} && docker build --build-arg SERVICE=core_api -t travel-ai-world/core-api:local .
    cd {{backend}} && docker build --build-arg SERVICE=ai_api -t travel-ai-world/ai-api:local .

# Backend-only stack: proxy :8080 + core_api + ai_api + DynamoDB Local (no Node needed)
docker-up:
    mkdir -p {{frontend}}/out
    cd {{backend}} && docker compose up --build -d

# Stop the Compose stack
docker-down:
    cd {{backend}} && docker compose down

# Frontend export for the Compose origin :8080 (an empty AI URL falls back to the core one)
build-stack:
    cd {{frontend}} && NEXT_PUBLIC_API_URL=http://localhost:8080 NEXT_PUBLIC_AI_API_URL= npm run build

# Full stack as deployed on :8080; recreates the proxy so it mounts the rebuilt out/
stack-up: build-stack docker-up
    cd {{backend}} && docker compose up -d --force-recreate --no-deps proxy

# Stop the full stack (same as docker-down)
stack-down: docker-down

# Tail logs: just docker-logs core_api | ai_api | proxy
docker-logs service="core_api":
    cd {{backend}} && docker compose logs -f {{service}}

# Bump the version in every manifest and commit (patch|minor|major); feature branches only
version bump="patch":
    python3 scripts/release.py bump {{bump}}

# Tag vX.Y.Z on main and create the GitHub release (needs gh)
release:
    python3 scripts/release.py publish

# Remove virtualenvs, node_modules and build output
clean:
    rm -rf {{backend}}/.venv {{frontend}}/node_modules {{frontend}}/.next {{frontend}}/out
