# Runbook — local development

## Prerequisites

- Node.js 24 (`src/frontend/.nvmrc`), Python 3.12 (`src/backend/.python-version`), [uv](https://github.com/astral-sh/uv), [just](https://just.systems)
- PostgreSQL 16 (local, Docker, or the devcontainer's)
- A Google OAuth client ID (the local flow keeps `AUTH_MODE=local`; the deployed Cognito flow is
  described in [`infra/aws/README.md`](../../infra/aws/README.md#sign-in-cognito)); an NVIDIA API key for the chat

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
just seed you@example.com   # optional: the four demo trips for that account (idempotent)
just dev-core      # http://localhost:8000/docs
just dev-ai        # http://localhost:8001/api/v1/ai/docs
just dev-frontend  # http://localhost:3000
```

## Signing in without Google

`core_api` runs with `AUTH_MODE=local` and trusts HS256 tokens signed with `SECRET_KEY`, so a
token can be minted from the shell for any existing account instead of going through the Google
button (which needs a real client id and a browser session):

```bash
just seed you@example.com                # creates the account (with the demo trips) if needed
just dev-token you@example.com           # prints the JWT POST /auth/google would issue (exit 1 if no such account)
```

The browser signs in when the token and the profile are in `localStorage` under the keys of
`src/frontend/src/services/session.ts`: `travel_ai_token` = the JWT, `travel_ai_user` =
`{"id": "<the token's sub>", "email": "...", "name": "..."}`. The Playwright suite does this with
`page.addInitScript` (`src/frontend/e2e/trips.spec.ts`), and a coding agent does it with the
Playwright MCP's `browser_evaluate` (`.claude/commands/check-site.md`, mode 2). The command is
`python -m core_api.devtools`, deliberately not an `ops` command: `ops` is what the Lambda's
`/events` exposes. In Cognito mode it refuses, since the pool issues those tokens.

## Which mode

| You want to | Run | Frontend talks to |
|---|---|---|
| Edit code with hot reload (the daily loop) | `just dev-core`, `just dev-ai`, `just dev-frontend` | `:8000` and `:8001` cross-origin (CORS, `.env.local` values above) |
| Same, against the built backend images | `just docker-up` + `just dev-frontend` | `:8080` cross-origin: set `NEXT_PUBLIC_API_URL=http://localhost:8080`, `NEXT_PUBLIC_AI_API_URL=` |
| See the stack as deployed, on one origin | `just stack-up` (needs Docker) | itself: the export and `/api/*` on `http://localhost:8080`, no CORS |

The last one mirrors CloudFront in production and is what CI's `e2e-stack` job runs; details
in the [Docker runbook](docker.md#the-stack-as-deployed). It rebuilds the export, so it is for
checking a change end to end, not for editing.

## End-to-end tests

Three Playwright configs share `src/frontend/e2e/`:

| Recipe | Serves | Runs | Where |
|---|---|---|---|
| `just test-e2e` | `next dev` on :3000 (started for you) | `smoke.spec.ts`, the landing page | the daily loop |
| `just test-e2e-static` | `next build` on :3100 (started for you) | smoke + `prerender.spec.ts` | CI's `frontend` job |
| `just test-e2e-stack` | the Compose stack on :8080 (already up) | everything, incl. the signed-in `trips.spec.ts` | CI's `e2e-stack` job |

The signed-in suite needs the seeded account and its token; without `E2E_TOKEN` it skips itself,
so the first two modes stay backend-free:

```bash
just stack-up                                   # needs Docker
just seed you@example.com
E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
cd src/frontend && npx playwright show-report   # after a failure
```

`E2E_EMAIL` overrides the profile's email (it defaults to the token's `email` claim). The
devcontainer has no Docker, so there the same spec can be pointed at the dev servers instead:
`PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack`
with `just dev-core` and `just dev-frontend` running; the Compose origin itself is proven in CI.

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
