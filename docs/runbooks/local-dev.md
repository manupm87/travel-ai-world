# Runbook — local development

## Prerequisites

- Node.js 24 (`src/frontend/.nvmrc`), Python 3.12 (`src/backend/.python-version`), [uv](https://github.com/astral-sh/uv), [just](https://just.systems)
- PostgreSQL 16 (local, Docker, or the devcontainer's)
- A Google OAuth client ID; an NVIDIA API key for the chat

## First run

```bash
just setup
```

Then edit the three env files it created:

| File | Must set |
|---|---|
| `src/backend/services/core_api/.env` | `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DB_*` |
| `src/backend/services/ai_api/.env` | `SECRET_KEY` (**same value**), `NVIDIA_API_KEY` |
| `src/frontend/.env.local` | `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_API_URL=http://localhost:8000`, `NEXT_PUBLIC_AI_API_URL=http://localhost:8001` |

Generate a key: `python -c "import secrets; print(secrets.token_hex(32))"`.

## Run

Three terminals (also inside the devcontainer):

```bash
just migrate       # once, and after pulling new migrations
just dev-core      # http://localhost:8000/docs
just dev-ai        # http://localhost:8001/api/v1/ai/docs
just dev-frontend  # http://localhost:3000
```

## Before pushing

```bash
just lint
just test            # test-core needs PostgreSQL; it creates <DB_NAME>_test
just contracts       # only if you changed a schema or a route
just docs-check
```

## Devcontainer

Open the repo in VS Code → "Reopen in Container". `.devcontainer/` starts **only** a terminal
container and PostgreSQL 16; the services are not run for you. On first creation it runs
`just setup`, `just migrate` and installs Playwright's Chromium, then you fill in the secrets and
run `just dev-core`, `just dev-ai` and `just dev-frontend` exactly as above (ports 3000, 8000
and 8001 are forwarded). `DB_*` are injected by the compose file, so `core_api`, migrations and
`just test-core` reach the container's database without editing `.env`.
That same Chromium backs the Playwright MCP server declared in `.mcp.json`, which lets coding
agents drive a headless browser against `:3000` (see `.claude/commands/check-site.md`).
Details: [`.devcontainer/README.md`](../../.devcontainer/README.md).
