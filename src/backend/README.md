# 🚀 Kyrian World — Backend workspace

![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3.12-3776AB.svg?style=for-the-badge&logo=python&logoColor=white)
![uv](https://img.shields.io/badge/uv-workspace-DE5FE9?style=for-the-badge)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=for-the-badge&logo=amazondynamodb&logoColor=white)

The backend is a **uv workspace** with two deployable services and one shared library.
Why two services: [ADR 0001](../../docs/architecture/adr/0001-backend-split.md).
How they fit: [architecture overview](../../docs/architecture/overview.md).

| Package | Path | Role |
|---|---|---|
| `core-api` | [`services/core_api/`](services/core_api/README.md) | Google OAuth / Cognito, users, trips CRUD, chat conversations; one DynamoDB table (ADR 0023) |
| `ai-api` | [`services/ai_api/`](services/ai_api/README.md) | Chat streaming over NVIDIA models; future RAG |
| `travel-common` | [`libs/travel_common/`](libs/travel_common/README.md) | Identity, settings, errors, JWT, app factory |
| `city-scraper` | [`tools/scraper/`](tools/scraper/README.md) | Data ingestion scripts (workspace member, never deployed) |
| `city-corpus` | [`tools/city_corpus/`](tools/city_corpus/README.md) | Licence-clean city knowledge base (Wikivoyage, Wikipedia, OSM, Wikidata, Open-Meteo) as JSONL for RAG (never deployed) |

## Quick start

```bash
# from the repo root
just setup          # creates .env files, uv sync, npm install
just dynamodb-local # DynamoDB on :8002 for core_api (the devcontainer and Compose bring their own)
just dev-core       # http://localhost:8000/docs
just dev-ai         # http://localhost:8001/api/v1/ai/docs
```

Without `just`, from `src/backend/`:

```bash
uv sync
cd services/core_api && uv run uvicorn core_api.main:app --reload --port 8000
cd services/ai_api   && uv run uvicorn ai_api.main:app --reload --port 8001
```

Each service reads its own `.env` (copy the `.env.example` next to it). `AUTH_MODE` and its
settings must be the same in both: `ai_api` verifies the same tokens `core_api` accepts.

## Tests, lint, contracts

```bash
just lint             # ruff check + format + pyright (backend, scripts) + eslint
just test-backend     # travel_common, core_api (moto; its copy test uses PostgreSQL or skips), ai_api
just contracts        # export OpenAPI → docs/api, regenerate frontend types
```

## Docker

One `Dockerfile`, two images; `docker-compose.yml` adds nginx on `:8080` routing `/api/v1/ai/*` to
`ai_api`, `/api/*` to `core_api` and everything else to the frontend's static export
(`../frontend/out`, bind-mounted; `just stack-up` builds it, `just docker-up` skips it). The same
origin for pages and API is what CloudFront does in production. The same images run on AWS Lambda through the Lambda Web
Adapter baked into the runtime stage. There are no migrations (`core_api` is on DynamoDB,
ADR 0023); the one-off `copy-from-postgres` runs as `python -m core_api.ops` or a
`{"command": "copy-from-postgres"}` invocation. See the [Docker runbook](../../docs/runbooks/docker.md).

## Layout

```text
src/backend/
├── pyproject.toml, uv.lock       workspace root (one lockfile)
├── Dockerfile, docker-compose.yml, docker/
├── scripts/export_openapi.py
├── libs/travel_common/
├── services/
│   ├── core_api/   api → services → domain ← infrastructure/dynamo, tests/
│   └── ai_api/     domain → application → infrastructure → api, tests/
└── tools/scraper/  city data ingestion scripts (not deployed) → its README
```

For agents: [`AGENTS.md`](AGENTS.md).
