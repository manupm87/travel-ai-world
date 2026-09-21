# Claude Code — Kyrian World

@../AGENTS.md

Everything about the project, its commands and its rules lives in `AGENTS.md` (imported above).
This file adds only what is specific to Claude Code.

## Claude-specific

- **Slash commands** in `.claude/commands/` (listed with their descriptions in every session): prefer
  them over raw `just` recipes when they exist. `/add-city <name>` is the whole pipeline for a new
  city (runbook: `docs/runbooks/add-city.md`).
- **Delivery is a workflow, not a solo session** (the default in `AGENTS.md`, "How work is delivered"):
  `/deliver-issue TRA-<n>` runs `.claude/workflows/kyrian-wave.js` — Opus implements in a worktree,
  three Sonnet reviewers read the diff, Opus fixes and watches CI. Runbook: `docs/runbooks/agent-delivery.md`.
- **Linear** is the issue tracker: the `linear` MCP server in `.mcp.json` (OAuth through `/mcp`,
  no token in the repo; tools `mcp__linear__get_issue`, `list_issues`, `update_issue`, `create_comment`, ...).
  Start every task with `/start-issue TRA-<n>`: it reads the issue and creates the branch. When the
  PR is open, comment its URL on the issue; the PR body carries `Closes TRA-<n>`.
- **Branch names are checked by a hook** (`.claude/hooks/check-branch-name.sh`, wired in
  `.claude/settings.json`): `git checkout -b` / `git switch -c` with a name outside
  `<type>/TRA-<n>-<slug>` is denied. Do not work around it; get the issue key instead.
- **Design file** `docs/design/ideas.pen`: read or edit **only** with the Pencil MCP tools (`mcp_pencil_*`).
- **Browser checks**: `/check-site` (Playwright MCP from `.mcp.json`, or `just test-e2e`).
