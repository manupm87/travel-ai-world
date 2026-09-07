# Runbook — Docker

## Images

One `src/backend/Dockerfile` builds either service:

```bash
cd src/backend
docker build --build-arg SERVICE=core_api -t travel-ai-world/core-api:local .
docker build --build-arg SERVICE=ai_api   -t travel-ai-world/ai-api:local .
# or: just docker-build
```

Build context is the workspace root (`src/backend/`) because both images need `uv.lock` and
`libs/travel_common`. The dependency layer is cached until a manifest changes; packages are
installed non-editable so the runtime stage carries no source tree. Migrations are copied only
when the service has an `alembic/` directory; the shared entrypoint runs them if present.

CI publishes `ghcr.io/manupm87/travel-ai-world/core-api` and `.../ai-api` (tags: commit SHA and
`latest`, platform `linux/amd64`) on every push to `main` touching `src/backend/`
(`.github/workflows/backend-images.yml`, which calls the reusable `_build-image.yml`).

## Local stack

```bash
just docker-up      # builds and starts proxy + core_api + ai_api + PostgreSQL
just docker-logs ai_api
just docker-down
```

| URL | Service |
|---|---|
| <http://localhost:8080> | nginx proxy — point `NEXT_PUBLIC_API_URL` here |
| <http://localhost:8000/docs> | core_api directly |
| <http://localhost:8001/api/v1/ai/docs> | ai_api directly |
| localhost:5432 | PostgreSQL (`DB_USER`/`DB_PASSWORD` from `core_api/.env`) |

`docker-compose.yml` reads `services/core_api/.env` and `services/ai_api/.env`; `DB_SERVER` and
`CORE_API_URL` are overridden to the Compose service names. PostgreSQL receives only `POSTGRES_*`
(interpolated from `DB_*` via `--env-file`), never the whole `.env`. The proxy waits for both
services' health checks before it starts routing.

## Troubleshooting

- `core_api` restarts in a loop → migrations failed; `just docker-logs core_api`.
- Chat answers arrive all at once → a proxy is buffering; nginx config sets `proxy_buffering off`
  and the app sends `X-Accel-Buffering: no`.
- `ai_api` answers 503 on `/api/v1/ai/health/provider` → `NVIDIA_API_KEY` missing.
