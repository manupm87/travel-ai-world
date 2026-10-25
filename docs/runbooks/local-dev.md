# Runbook — local development

## Prerequisites

- Node.js 24 (`src/frontend/.nvmrc`), Python 3.12 (`src/backend/.python-version`),
  [uv](https://github.com/astral-sh/uv) and [just](https://just.systems). On Windows:
  `winget install Casey.Just` and run the recipes from Git Bash or WSL (they are POSIX shell).
- Nothing else for the app and its tests: no database server (DynamoDB is `just dynamodb-local`,
  moto in memory), no Google client, no API key and no AWS account. Those are optional and only add
  the real Google button and the live planner ([below](#optional-the-live-planner)).
- Docker only for the Compose modes ([which mode](#which-mode)).

## First run

```bash
just setup
```

It copies the three env files from their templates (`core_api/.env`, `ai_api/.env`,
`src/frontend/.env.local`), installs every dependency and writes one random `SECRET_KEY` into
both backend `.env` files: the two services verify the same tokens, so the value must match (the
recipe warns when it does not). The template values run everything below as they are.

| Optional variable | File | Adds |
|---|---|---|
| `GOOGLE_CLIENT_ID` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the same client id) | `core_api/.env`, `src/frontend/.env.local` | the real "Sign in with Google" button; the client must list `http://localhost:3000` as a JavaScript origin |
| `NVIDIA_API_KEY`, `RETRIEVAL_ENABLED=true` | `ai_api/.env` | the live planner, with an AWS session ([below](#optional-the-live-planner)) |
| `INTERACTIONS_TABLE=travel-ai-local-interactions` | `ai_api/.env` | turn traces and token counters in the local DynamoDB (the admin console's turns) |
| `ACCESS_CONTROL_ENABLED=true`, `ACCESS_MODE=allowlist` | `ai_api/.env`, `core_api/.env` | the access list and the daily quota ([access runbook](access.md)) |

## Run

Four terminals (three inside the devcontainer, which brings its own DynamoDB Local):

```bash
just dynamodb-local  # :8002, moto in memory: tables and items vanish when it stops
just dev-core        # http://localhost:8000/docs (creates its table on the endpoint at start)
just dev-ai          # http://localhost:8001/api/v1/ai/docs
just dev-frontend    # http://localhost:3000
```

The services reach DynamoDB through `DYNAMODB_ENDPOINT_URL` (the template's
`http://localhost:8002`; leave it empty only on AWS). Against a local endpoint the client signs
with fixed dummy keys, so no AWS profile is needed. Tests need none of this: they use
`travel_common.testing.mock_dynamodb()` (moto in process).

## Signing in without Google

`core_api` runs with `AUTH_MODE=local` and trusts HS256 tokens signed with `SECRET_KEY`, so a
token can be minted from the shell for any account instead of going through the Google button:

```bash
just dev-token you@example.com --browser   # a line to paste in the DevTools console of :3000
just dev-token you@example.com             # the bare JWT (curl, E2E_TOKEN)
just dev-token you@example.com --admin     # the same account as an administrator (/admin/)
just dev-grant you@example.com             # on the access list, for ACCESS_MODE=allowlist (access.md)
```

The `--browser` line stores the token and the profile under the keys of
`src/frontend/src/services/session.ts` (`travel_ai_token`, `travel_ai_user`) and reloads: the page
opens signed in. The account is created when it is new — a later Google sign-in adopts it, because
both match on the email — and starts with no trips: make one in the planner. The Playwright suite
signs in the same way with `page.addInitScript` (`src/frontend/e2e/trips.spec.ts`).
`python -m core_api.devtools` is never imported by the deployed service (it creates accounts), and
in Cognito mode it refuses, since the pool issues those tokens.

## Optional: the live planner

With the template's `RETRIEVAL_ENABLED=false`, `POST /api/v1/ai/planner` and `/planner/card` answer
**503** and the planner page says so (every card is a corpus document). To see the planner without
AWS, either set `NEXT_PUBLIC_AI_API_URL=` (empty) in `src/frontend/.env.local` — the AI calls then
go to `core_api`, which answers 404, and the page plays its recorded demo session — or run
`just planner-smoke <city>` for a backend-only session over the committed corpus (needs
`NVIDIA_API_KEY`).

The live planner reads the deployed S3 Vectors index and embeds the question with Titan on Bedrock,
so it needs an AWS session (the course account), `RETRIEVAL_ENABLED=true` and a model that calls
tools: the template's `NVIDIA_CHAT_MODEL` (`nvidia/nemotron-3-super-120b-a12b`) with an
`NVIDIA_API_KEY` from build.nvidia.com, or `LLM_PROVIDER=bedrock`.

```bash
just aws-login                  # AWS_PROFILE in the environment, as for Bedrock
just index budapest --dry-run   # optional: parse and measure the corpus, no AWS
just index budapest             # only when the corpus changed: reloads the shared index
```

`just index` writes to the **one index the deployment also reads**: run it when the committed corpus
changes, not to experiment. Each answer then logs `Retrieved N passages: <doc_id>@<distance>, ...`
([`ai_api/README.md`](../../src/backend/services/ai_api/README.md#retrieval-retrieval_enabled)).

Business metrics in a local Prometheus + Grafana (ADR 0030): [`infra/aws/metric/README.md`](../../infra/aws/metric/README.md).

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

Once per machine (the devcontainer does it for you): `cd src/frontend && npx playwright install chromium`.
Three Playwright configs share `src/frontend/e2e/`:

| Recipe | Serves | Runs | Where |
|---|---|---|---|
| `just test-e2e` | `next dev` on :3000 (started for you, or reused if something already listens there) | every spec but `prerender.spec.ts`; the signed-in ones skip without `E2E_TOKEN` | the daily loop |
| `just test-e2e-static` | `next build` on :3100 (started for you) | every spec, `prerender.spec.ts` included; the signed-in ones skip without `E2E_TOKEN` | CI's `frontend` job |
| `just test-e2e-stack` | the Compose stack on :8080 (already up) | everything, incl. the signed-in `trips.spec.ts` and `planner.spec.ts` (the planner page over the recorded Budapest session, `/ai/planner` mocked in the browser) | CI's `e2e-stack` job |

The signed-in suite needs a token and creates the trips it works on through the API; without
`E2E_TOKEN` it skips itself, so the first two modes stay backend-free:

```bash
just stack-up                                   # needs Docker
E2E_TOKEN=$(docker compose -f src/backend/docker-compose.yml exec -T core_api python -m core_api.devtools token you@example.com) just test-e2e-stack
cd src/frontend && npx playwright show-report   # after a failure
```

The token is minted inside the `core_api` container, which holds the stack's `SECRET_KEY` and
reaches its DynamoDB Local. `E2E_EMAIL` overrides the profile's email (it defaults to the token's
`email` claim). Without Docker (the devcontainer has none) the same spec runs against the dev servers:
`PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack`
with `just dev-core` and `just dev-frontend` running; the Compose origin itself is proven in CI.

## Before pushing

```bash
just lint
just test            # no .env, database or network needed
just contracts       # only if you changed a schema or a route
just docs-check
```

## Devcontainer

Open the repo in VS Code → "Reopen in Container". It starts a terminal container and DynamoDB
Local, runs `just setup` and installs Playwright's Chromium on first creation, and forwards ports
3000, 8000 and 8001; you then run `just dev-core`, `just dev-ai` and `just dev-frontend` as above
(no `just dynamodb-local`: the compose file points `DYNAMODB_ENDPOINT_URL` at its own DynamoDB
Local). Details: [`.devcontainer/README.md`](../../.devcontainer/README.md).
