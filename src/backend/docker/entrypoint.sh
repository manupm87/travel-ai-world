#!/bin/sh
# Shared entrypoint for both images, everywhere they run:
#
#   entrypoint.sh                 serve on :8000 (Compose, ECS, Lambda through the Web Adapter)
#   entrypoint.sh migrate         apply Alembic migrations and exit (core_api only)
#
# Migrations run at start only where the container is the deploy unit
# (Compose, ECS). On Lambda (AWS_LAMBDA_FUNCTION_NAME is set) the deploy
# workflow invokes the function with {"command": "migrate"} instead, so a
# cold start never races a schema change. MIGRATE_ON_START=false opts out anywhere.
set -e

if [ "${1:-}" = "migrate" ]; then
  if [ ! -f /app/alembic.ini ]; then
    echo "==> [${SERVICE}] has no migrations" >&2
    exit 1
  fi
  echo "==> [${SERVICE}] Running Alembic migrations..."
  exec alembic upgrade head
fi

if [ -f /app/alembic.ini ] && [ -z "${AWS_LAMBDA_FUNCTION_NAME:-}" ] && [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  echo "==> [${SERVICE}] Running Alembic migrations..."
  alembic upgrade head
fi

echo "==> [${SERVICE}] Starting uvicorn on :8000"
exec uvicorn "${SERVICE}.main:app" --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
