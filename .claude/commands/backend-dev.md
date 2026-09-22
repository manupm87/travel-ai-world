Run a backend service locally with hot reload.

The backend is two services; pick the one you are working on:

```bash
just dev-core   # core_api → http://localhost:8000/docs
just dev-ai     # ai_api   → http://localhost:8001/api/v1/ai/docs
```

Without `just`:

```bash
cd src/backend/services/core_api && uv run uvicorn core_api.main:app --reload --port 8000
cd src/backend/services/ai_api   && uv run uvicorn ai_api.main:app --reload --port 8001
```

Notes:

- Each service reads its own `.env` (`src/backend/services/<service>/.env`); `SECRET_KEY` must match.
- `core_api` needs DynamoDB: run `just dynamodb-local` (in-memory, :8002) first. There are no migrations (ADR 0023).
