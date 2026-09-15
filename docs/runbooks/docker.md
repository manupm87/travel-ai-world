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

## The same image on AWS Lambda

The runtime stage copies the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter)
into `/opt/extensions/lambda-adapter` ([ADR 0009](../architecture/adr/0009-lambda-cognito-budget.md)).
It is a Lambda extension: it only starts when the Lambda runtime API is present, so Compose, ECS
and `docker run` are unaffected. On Lambda it translates each invocation into an HTTP request to
uvicorn on `AWS_LWA_PORT=8000` and waits for the readiness path before the first one:

| Image | `AWS_LWA_INVOKE_MODE` | `AWS_LWA_READINESS_CHECK_PATH` |
|---|---|---|
| `core-api` | `buffered` | `/api/v1/health/` |
| `ai-api` | `response_stream` (the SSE chat streams end to end) | `/api/v1/ai/health/` |

The values are baked into the image (one tiny stage per service in the `Dockerfile`), so
Terraform does not have to repeat them; the function's own environment can still override them.

**Migrations.** Outside Lambda the entrypoint applies them at start, as before
(`MIGRATE_ON_START=false` opts out). On Lambda (`AWS_LAMBDA_FUNCTION_NAME` is set) it does not,
so a cold start never races a schema change; the deploy workflow runs them instead:

```bash
# CLI form: any container with the core-api image
docker run --rm --env-file services/core_api/.env travel-ai-world/core-api:local migrate

# Lambda form: the adapter delivers a non-HTTP payload as POST /events (never routed by the gateway)
aws lambda invoke --function-name <core-api function> --cli-binary-format raw-in-base64-out \
  --payload '{"command": "migrate"}' /dev/stdout
```

Both end in `alembic upgrade head` (`core_api/ops.py`); an unknown command answers 400.

**Trying it locally with the Runtime Interface Emulator** (optional; needs Docker and the
[`aws-lambda-rie`](https://github.com/aws/aws-lambda-runtime-interface-emulator) binary in `~/.aws-lambda-rie/`):

```bash
docker run --rm -p 9000:8080 -e SECRET_KEY=x -e AWS_LWA_INVOKE_MODE=buffered \
  -v ~/.aws-lambda-rie:/aws-lambda --entrypoint /aws-lambda/aws-lambda-rie \
  travel-ai-world/ai-api:local /app/entrypoint.sh
curl -s -XPOST http://localhost:9000/2015-03-31/functions/function/invocations \
  -d '{"version":"2.0","rawPath":"/api/v1/ai/health/","requestContext":{"http":{"method":"GET","path":"/api/v1/ai/health/"}},"headers":{}}'
```

The emulator does not support response streaming, hence `buffered` for the check; streaming is
verified on the real function (TRA-121). CI checks on every PR that the adapter binary is in the
image with the right settings and that `migrate` exits instead of serving.

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
- A Lambda function never becomes ready → the readiness path answered non-2xx; check the function
  logs for the adapter's line and the app's startup errors (`SECRET_KEY`/`COGNITO_*`, database).
- Chat answers arrive all at once → a proxy is buffering; nginx config sets `proxy_buffering off`
  and the app sends `X-Accel-Buffering: no`.
- `ai_api` answers 503 on `/api/v1/ai/health/provider` → `NVIDIA_API_KEY` missing.
