# `.devcontainer` — Development Container

A reproducible VS Code environment for the monorepo: Node 24, Python 3.12 (via `uv`), `just`,
`gh`, ripgrep/fd/jq, AWS CLI v2 + Terraform + `crane` + Session Manager plugin, Claude Code
(plus optional agent CLIs), Playwright's Chromium, and a PostgreSQL 16 container. **It does not run the application**: you start the services yourself
with the same `just` recipes everyone uses.

## What starts

| Service | Notes |
|---|---|
| `devcontainer` | your terminal; the repo is mounted at `/workspace` |
| `db` | PostgreSQL 16, `postgres`/`postgres`, database `travel_ai_world`, forwarded to `localhost:5432` |

`src/backend/.venv`, `src/frontend/node_modules` and `src/frontend/.next` are named Docker volumes, so the
host's copies (with their platform-specific binaries) are never touched.

On first creation `post-create.sh` runs `just setup` (creates the `.env` files, `uv sync`,
`npm install`), `just migrate` and installs Chromium for `just test-e2e`.

## Database wiring

The `devcontainer` service exports `DB_SERVER=db`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`
as environment variables, which take precedence over `src/backend/services/core_api/.env`.
`just dev-core`, `just migrate` and `just test-core` therefore hit the `db` container with no
edits to the `.env`. The remaining keys (`SECRET_KEY`, `GOOGLE_*`, `NVIDIA_API_KEY`) still have
to be filled in the `.env` files, as in the [local-dev runbook](../docs/runbooks/local-dev.md).

## Use

1. VS Code → "Dev Containers: Reopen in Container" and wait for `post-create.sh` to finish.
2. Fill in the secrets in `src/backend/services/core_api/.env`, `src/backend/services/ai_api/.env`
   and `src/frontend/.env.local`.
3. In three terminals: `just dev-core`, `just dev-ai`, `just dev-frontend`. Ports 8000, 8001
   and 3000 are forwarded; open <http://localhost:3000>.
4. `just lint`, `just test`, `just test-e2e`, `just contracts` work as documented.

Closing the VS Code window stops the compose stack (`shutdownAction: stopCompose`); the
PostgreSQL data and the dependency volumes persist between sessions. To wipe them:
`docker compose -f .devcontainer/docker-compose.yml down -v` on the host.

If `postCreate` fails at `just migrate` with `password authentication failed for user
"postgres"`, the `postgres_data` volume was initialised by an older compose file with other
credentials (`POSTGRES_*` only apply on first init). Wipe the volumes as above and rebuild, or,
inside the container, create the missing role with the old credentials
(`psql -h db -U <old-user> -c "CREATE ROLE postgres LOGIN SUPERUSER PASSWORD 'postgres'"`) and
re-run `bash .devcontainer/post-create.sh`.

## AWS

The container ships the tools the [AWS deployment](../infra/aws/README.md) needs and nothing
else (no Docker daemon, no SAM/CDK):

| Tool | Why | Pinned in |
|---|---|---|
| `aws` (CLI v2) | `sts`, `ecr`, `ecs`, `logs`, SSO login | latest at build |
| `terraform` | `infra/aws/` (`just infra-fmt`, `just infra-validate aws`, plan/apply) | `TERRAFORM_VERSION` build arg |
| `crane` | copy the GHCR images into ECR without a Docker daemon | `CRANE_VERSION` build arg |
| `session-manager-plugin` | `aws ecs execute-command` into a running Fargate task | latest at build |

**Authentication is IAM Identity Center (SSO), never access keys.** The compose file sets
`AWS_PROFILE=travel-ai-world`; `post-create.sh` seeds `~/.aws/config` from
[`aws-config.example`](aws-config.example) (account id, role name, start URL, region: nothing
secret). Fill those in once, then:

```bash
just aws-login          # device-code login in the browser, then prints the identity
```

Tokens are short-lived and cached in `~/.aws/sso/cache`; `~/.aws` is the `aws_config` named
volume, so both the profile and the cache survive "Rebuild Container". The host's `~/.aws` is
**not** mounted: whatever runs in the container (including the coding agents) only ever holds
the SSO session's temporary credentials, scoped by the permission set. Do not write
`aws_access_key_id` anywhere; CI uses OIDC ([ADR 0007](../docs/architecture/adr/0007-aws-cloud-and-auth.md)).

## Coding agents

| CLI | Installed | Config volume |
|---|---|---|
| Claude Code (`claude`) | always, native installer (self-updating) | `agent_claude` → `~/.claude` (`CLAUDE_CONFIG_DIR`) |
| Codex (`codex`) | default, via `EXTRA_AGENT_CLIS` | `agent_codex` → `~/.codex` |
| Gemini CLI (`gemini`) | default, via `EXTRA_AGENT_CLIS` | `agent_gemini` → `~/.gemini` |
| Copilot CLI (`copilot`) | default, via `EXTRA_AGENT_CLIS` | `agent_copilot` → `~/.copilot` |

Log in once inside the container (`claude`, `codex login`, `gemini`, `copilot`, `gh auth login`);
the credentials live in the named volumes above, so they survive "Rebuild Container". Shell
history is persisted the same way (`shell_history` → `/commandhistory`).

To change the optional set, export `DEVCONTAINER_EXTRA_AGENT_CLIS` on the host **before**
launching VS Code (it is a Compose build arg):

```bash
DEVCONTAINER_EXTRA_AGENT_CLIS="@openai/codex" code .   # Codex only
DEVCONTAINER_EXTRA_AGENT_CLIS="" code .                # Claude Code only
```

Then "Rebuild Container". Cursor, Antigravity and Jules run on the host or in the cloud and need
nothing here.

## VS Code extensions

`devcontainer.json` installs only extensions tied to the project's tooling: Claude Code, Python +
Pylance + Ruff, ESLint + Prettier + Tailwind, Vitest + Playwright, Terraform, TOML/YAML,
GitHub Actions, `just` syntax and Mermaid preview. Personal ones (Copilot, Gemini Code Assist,
GitLens, ...) go in **your** VS Code user settings so they follow you into every devcontainer:

```jsonc
// settings.json (user)
"dev.containers.defaultExtensions": ["github.copilot", "github.copilot-chat", "eamodio.gitlens"]
```

## Production-like stack

`src/backend/docker-compose.yml` (`just docker-up`: built images + nginx on `:8080`) is meant to run
**on the host**, not from inside the devcontainer, because it bind-mounts paths relative to
the host filesystem.
