# Claude Code — Kyrian World

@../AGENTS.md

Everything about the project, its commands and its rules lives in `AGENTS.md` (imported above).
This file adds only what is specific to Claude Code.

## Claude-specific

- **Slash commands** in `.claude/commands/`: `/start-issue`, `/backend-dev`, `/backend-test`,
  `/backend-lint`, `/backend-db-migrate`, `/check-site`, `/add-i18n-key`, `/add-language`,
  `/new-section`, `/add-city`. Most are thin wrappers over `just` recipes; prefer them when they
  exist. `/add-city <name>` is the whole pipeline for a new city (runbook: `docs/runbooks/add-city.md`).
- **Linear** is the issue tracker: the `linear` MCP server in `.mcp.json` (OAuth through `/mcp`,
  no token in the repo; tools `mcp__linear__get_issue`, `list_issues`, `update_issue`, `create_comment`, ...).
  Start every task with `/start-issue TRA-<n>`: it reads the issue and creates the branch. When the
  PR is open, comment its URL on the issue; the PR body carries `Closes TRA-<n>`.
- **Branch names are checked by a hook** (`.claude/hooks/check-branch-name.sh`, wired in
  `.claude/settings.json`): `git checkout -b` / `git switch -c` with a name outside
  `<type>/TRA-<n>-<slug>` is denied. Do not work around it; get the issue key instead.
- **Settings files**: `.claude/settings.json` is shared (hooks, approved MCP servers) and committed;
  personal plugins and overrides go in `.claude/settings.local.json` (ignored).
- **Design file** `docs/design/ideas.pen`: read or edit **only** with the Pencil MCP tools (`mcp_pencil_*`).
- **Browser checks**: use the Playwright MCP declared in `.mcp.json` (tools `mcp__playwright__browser_*`)
  or `just test-e2e`, as described in `/check-site`.
- When a task changes architecture, contracts or infrastructure, draft the ADR in
  `docs/architecture/adr/` in the same PR (template in that folder's README).
