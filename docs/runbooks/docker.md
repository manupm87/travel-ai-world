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

**Commands.** `core_api/ops.py` holds the commands an image can run instead of serving:
`migrate` (`alembic upgrade head`) and `seed <email>` (the four demo trips for that account,
[ADR 0011](../architecture/adr/0011-real-trips-seed-and-client-side-loading.md)). Outside Lambda
the entrypoint applies migrations at start, as before (`MIGRATE_ON_START=false` opts out). On
Lambda (`AWS_LAMBDA_FUNCTION_NAME` is set) it does not, so a cold start never races a schema
change; the deploy workflow runs them instead:

```bash
# CLI form: any container with the core-api image
docker run --rm --env-file services/core_api/.env travel-ai-world/core-api:local migrate
docker run --rm --env-file services/core_api/.env travel-ai-world/core-api:local seed you@example.com

# Compose form: the running core_api container (its DB_SERVER already points at the stack's PostgreSQL)
docker compose exec core_api /app/entrypoint.sh seed you@example.com

# Lambda form: the adapter delivers a non-HTTP payload as POST /events (404 outside Lambda; never routed by the gateway)
aws lambda invoke --function-name <core-api function> --cli-binary-format raw-in-base64-out \
  --payload '{"command": "migrate"}' /dev/stdout
aws lambda invoke --function-name <core-api function> --cli-binary-format raw-in-base64-out \
  --payload '{"command": "seed", "args": {"email": "you@example.com"}}' /dev/stdout
```

Every form ends in `core_api.ops.run_command`; an unknown command, or `seed` without an email,
answers 400 (exit code 1 from the CLI). The deployed sequence (promote the image, then seed by
hand, what to expect in CloudWatch) is in [deploy.md](deploy.md#seed-demo-data).

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
just stack-up       # frontend export for :8080 + proxy + core_api + ai_api + PostgreSQL
just docker-up      # the same without the frontend build (backend only, no Node needed)
just docker-logs ai_api
just docker-down    # or: just stack-down
```

| URL | Service |
|---|---|
| <http://localhost:8080> | nginx: the frontend export at `/`, `core_api` at `/api/*`, `ai_api` at `/api/v1/ai/*` |
| <http://localhost:8000/docs> | core_api directly |
| <http://localhost:8001/api/v1/ai/docs> | ai_api directly |
| localhost:5432 | PostgreSQL (`DB_USER`/`DB_PASSWORD` from `core_api/.env`) |

`docker-compose.yml` reads `services/core_api/.env` and `services/ai_api/.env`; `DB_SERVER` and
`CORE_API_URL` are overridden to the Compose service names. PostgreSQL receives only `POSTGRES_*`
(interpolated from `DB_*` via `--env-file`), never the whole `.env`. The proxy waits for both
services' health checks before it starts routing. Migrations run when `core_api` starts
(`MIGRATE_ON_START`, see above), in both recipes.

## The stack as deployed

`just stack-up` is the production shape on one machine: **one origin**, `http://localhost:8080`,
serves the static export and the API, exactly as CloudFront does in AWS
(`infra/aws/frontend.tf`: the S3 export behind `/`, API Gateway behind `/api/*`). The browser
never crosses origins, so CORS is not involved and the e2e suite can run against it unchanged.

| nginx `location` | Goes to | Notes |
|---|---|---|
| `/api/v1/ai/` | `ai_api` | buffering off, 300 s read timeout: the chat streams as SSE |
| `/api/` | `core_api` | only the API path reaches the backend, like the gateway in prod |
| `/` | `/usr/share/nginx/html` (bind mount of `src/frontend/out`, read-only) | `try_files $uri $uri/index.html $uri.html =404`, `error_page 404 /404.html` |

The `try_files` line is the CloudFront `directory_index` function in nginx terms:
`next.config.ts` sets `trailingSlash: true`, so the export has `dashboard/index.html`,
`trip/<id>/index.html`, and both `/dashboard/` and `/dashboard` resolve to that file. An unknown
path answers Next's `404.html` with a real 404 status. Backend errors pass through untouched
(`proxy_intercept_errors` is off), so `/api/v1/trips/` without a token is the API's 401 JSON,
not an HTML page. Hashed assets under `/_next/static/` are cached for a year; HTML is not.

The recipe is two steps that can be run separately:

```bash
just build-stack    # NEXT_PUBLIC_API_URL=http://localhost:8080 NEXT_PUBLIC_AI_API_URL= npm run build
just docker-up      # mkdir -p src/frontend/out, then docker compose up --build -d
```

The command-line variables override `.env.local` (the Google client id and the rest still come
from it); `NEXT_PUBLIC_AI_API_URL` is emptied because it defaults to the core URL
([ADR 0003](../architecture/adr/0003-frontend-two-base-urls.md)). `just stack-up` ends by
recreating the proxy container (`docker compose up -d --force-recreate --no-deps proxy`), and
that step matters: `next build` deletes and recreates `src/frontend/out/`, so a proxy that was
already running keeps the old, unlinked directory bind-mounted and answers its own 404 on every
page. Rerun `just stack-up` after a frontend change; `just build-stack` alone while the stack is
up leaves the proxy on the stale directory until it is recreated (or `just docker-down` + up).

**Without a frontend build** (`just docker-up` alone) the proxy still starts and `/api/*` works;
`/` and every page answer nginx's own 404 because `src/frontend/out/` is empty. Docker would
create a missing bind-mount source itself, as a root-owned directory that later breaks
`next build` on Linux, so the recipe runs `mkdir -p` first and the folder stays yours.

Sign-in on `:8080` uses the local Google flow: `core_api` keeps `AUTH_MODE=local` and verifies
the browser's Google credential with `GOOGLE_CLIENT_ID`, so the OAuth client in Google Cloud
needs `http://localhost:8080` among its authorised JavaScript origins (as `:3000` already is).

**In CI** the `stack-smoke` job of `.github/workflows/pr.yml` (path-filtered on `src/**`, the
`justfile` and the workflows) is where the stack is proven, because the devcontainer has no
Docker: it writes both service `.env` files from the `.env.example` templates with throwaway
values, runs `just stack-up`, waits for `/api/v1/health/` through the proxy and asserts with
`curl` that `/` and `/dashboard/` are HTML 200s, both health endpoints answer JSON,
`/does-not-exist/` is Next's page with a 404 and `/api/v1/trips/` is the API's 401 JSON. It then
runs `just stack-up` a second time and checks that `/` still answers, which proves the proxy is
recreated onto the rebuilt `out/`. The containers' logs are printed on failure and
`docker compose down -v` always runs.

## Troubleshooting

- `core_api` restarts in a loop → migrations failed; `just docker-logs core_api`.
- A Lambda function never becomes ready → the readiness path answered non-2xx; check the function
  logs for the adapter's line and the app's startup errors (`SECRET_KEY`/`COGNITO_*`, database).
- Chat answers arrive all at once → a proxy is buffering; nginx config sets `proxy_buffering off`
  and the app sends `X-Accel-Buffering: no`.
- `ai_api` answers 503 on `/api/v1/ai/health/provider` → `NVIDIA_API_KEY` missing.
