#!/bin/sh
# entrypoint.sh — runs Alembic migrations then starts the server.

set -e

echo "==> Running Alembic migrations..."
alembic upgrade head

echo "==> Starting FastAPI (production)..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
