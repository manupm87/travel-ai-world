# Runbook — local development

**The local environment is the devcontainer**; the host works too, with the same `just` recipes.
Either way, nothing but the toolchain is needed for the app and its tests: no database server, no
Google client, no API key and no AWS account. Those are optional and only add the real Google
button and the live planner ([below](#optional-the-live-planner)).

## Devcontainer (the default)

Prerequisites: Docker Desktop (on Windows with the WSL 2 backend), VS Code and its Dev Containers
extension.

1. Open the repo in VS Code → "Reopen in Container". The first creation builds the image and runs
   `.devcontainer/post-create.sh`: `just setup` (below) and Playwright's Chromium.
2. In three terminals of the container:

   ```bash
   just dev-core      # http://localhost:8000/docs (creates its table in DynamoDB Local at start)
   just dev-ai        # http://localhost:8001/api/v1/ai/docs
   just dev-frontend  # http://localhost:3000
   ```

The container brings DynamoDB Local (`dynamodb:8000`, in memory) and points
`DYNAMODB_ENDPOINT_URL` at it, so there is no `just dynamodb-local`; ports 3000, 8000 and 8001 are
forwarded to the host. It has no Docker daemon: the Compose modes ([which mode](#which-mode)) run
on the host. Toolchain, volumes and AWS sign-in: [`.devcontainer/README.md`](../../.devcontainer/README.md).

## On the host (without the container)

Prerequisites: Node.js 24 (`src/frontend/.nvmrc`), Python 3.12 (`src/backend/.python-version`),
[uv](https://github.com/astral-sh/uv) and [just](https://just.systems). On Windows:
`winget install Casey.Just` and run every recipe from **Git Bash** (or WSL): they are POSIX shell,
and PowerShell is not supported.

```bash
just setup           # once
just dynamodb-local  # :8002, moto in memory: tables and items vanish when it stops
just dev-core        # http://localhost:8000/docs
just dev-ai          # http://localhost:8001/api/v1/ai/docs
just dev-frontend    # http://localhost:3000
```

Four terminals: the template's `DYNAMODB_ENDPOINT_URL=http://localhost:8002` points both services
at `just dynamodb-local` (leave it empty only on AWS). Against a local endpoint the DynamoDB client
signs with fixed dummy keys, so no AWS profile is needed for it.

## `just setup` and the env files

It copies the three env files from their templates (`core_api/.env`, `ai_api/.env`,
`src/frontend/.env.local`), installs every dependency and writes one random `SECRET_KEY` into
both backend `.env` files: the two services verify the same tokens, so the value must match (the
recipe warns when it does not). The template values run everything here as they are. Tests need
none of this: they use `travel_common.testing.mock_dynamodb()` (moto in process) and a test key.

| Optional variable | File | Adds |
|---|---|---|
| `GOOGLE_CLIENT_ID` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (the same client id) | `core_api/.env`, `src/frontend/.env.local` | the real "Sign in with Google" button; the client must list `http://localhost:3000` as a JavaScript origin |
| `NVIDIA_API_KEY`, `RETRIEVAL_ENABLED=true` | `ai_api/.env` | the live planner, with an AWS session ([below](#optional-the-live-planner)) |
| `INTERACTIONS_TABLE=travel-ai-local-interactions` | `ai_api/.env` | turn traces and token counters in the local DynamoDB (the admin console's turns) |
| `ACCESS_CONTROL_ENABLED=true`, `ACCESS_MODE=allowlist` | `ai_api/.env`, `core_api/.env` | the access list and the daily quota ([access runbook](access.md)) |

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

On the host, once per machine (the devcontainer does it for you): `cd src/frontend && npx playwright install chromium`.
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
E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
cd src/frontend && npx playwright show-report   # after a failure
```

`E2E_EMAIL` overrides the profile's email (it defaults to the token's `email` claim). Without
Docker (the devcontainer has none) the same suite runs against the dev servers, with `just dev-core`,
`just dev-ai` and `just dev-frontend` running and the template's `NEXT_PUBLIC_AI_API_URL`;
`E2E_API_URL` tells the specs where `core_api` is, since it is not the page's origin there:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:8000 \
  E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
```

The Compose origin itself is proven in CI.

## Before pushing

```bash
just lint
just test            # no .env, database or network needed
just contracts       # only if you changed a schema or a route
just docs-check
```
