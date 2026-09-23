# Runbook — delivering an issue with agents

How a feature or fix gets from a Linear issue to a merged PR. This is the default way to
develop in this repository (the summary lives in [`AGENTS.md`](../../AGENTS.md), "How work is
delivered"); a solo session is the exception, for docs-only edits and one-line fixes.

## Why

Two things cost more than they should when one model does everything: the most capable model
spends its context typing boilerplate, and nobody independent reads the diff before CI does.
Splitting the work by role fixes both: the expensive model decides, cheaper models type and
review, and every PR reaches the human with a written brief, three reviews and a green CI.

## Roles

| Role | Who | Output |
|---|---|---|
| Audit and brief | the most capable model available (the main session) | the brief, the Linear issue, the branch name |
| Implement | Opus 5.5 (`claude-opus-5-5`), in its own git worktree | the branch and the PR |
| Review | three Sonnet 5 (`claude-sonnet-5`) reviewers, one lens each | findings with file, line, severity |
| Fix and ship | Opus 5.5, then the main session | fixes pushed, CI green, PR merged |

The human owns what the tooling asks a human for: merge approval when the permission
classifier denies it, `terraform apply`, production checks that need a real sign-in.

## 1. Audit and brief (main session)

1. `/start-issue TRA-<n>` reads the issue; if there is none, create it with the Linear MCP
   (`mcp__linear__save_issue`) — an agent-ready ticket carries the outcome and the acceptance
   list, so the human can review the PR against it.
2. Read the code involved yourself (routes, hooks, services, tests, docs). Decide; do not
   delegate decisions. What the brief settles, the implementer does not reopen.
3. Write the brief to a file outside the repo (the session's scratch directory) with these
   sections:

   ```markdown
   # Brief TRA-<n> — <title>
   Linear link · scope (frontend / backend / both) · branch · one PR or several
   ## Decisions (already taken — do not reopen)   numbered, concrete, file paths named
   ## Tests                                        unit + e2e, which files, what they assert
   ## Docs (same PR)                               README/AGENTS/ADR/overview/design doc
   ## Ground rules for the agents                  what not to touch, how to install in a worktree, checks
   ```

   A brief for both halves says which contract changes first and that `just contracts` runs
   after every schema change; one PR when the contract ties the halves, else one per half.
4. Put the outcome and acceptance list in the issue description too (the brief file is
   ephemeral; the ticket is the record).

## 2. Run the wave

Claude Code: `/deliver-issue TRA-<n>` — it launches `.claude/workflows/kyrian-wave.js` with
`{issue, branch, briefPath}` (optional `checks`, `base`). Other tools: give the brief to an
implementation agent in a worktree, then to reviewers, then to a fixer, in that order.

What the workflow does:

1. **Implement** (Opus, worktree): fetches, creates `<type>/TRA-<n>-<slug>` from `origin/main`,
   installs (`npm ci` in `src/frontend`, `uv sync` in `src/backend`), implements the brief with
   its tests and docs, runs the checks, commits, pushes, opens the PR from the template with
   `Closes TRA-<n>`. Returns the PR URL, the head SHA and the deviations from the brief.
2. **Review** (Sonnet ×3, in parallel): correctness and state · contracts, rules and tests ·
   UX, copy and accessibility. Each returns findings (`blocker` / `should` / `nit`) and a verdict.
3. **Fix** (Opus, worktree): applies every finding it can confirm in the code (skips need a
   reason), re-runs the checks, pushes, watches CI on the pushed head with `gh pr checks
   --watch`, up to two rounds. It never merges.

Resume after a pause or a script edit: `Workflow({scriptPath, resumeFromRunId})` — finished
agents return cached results. Read `journal.jsonl` in the run's transcript directory before
assuming a cached result holds something.

## 3. Ship (main session)

1. Read the fixer's report: deviations, skipped findings, CI state. Check the PR yourself
   (`gh pr view --json mergeStateStatus`): `CLEAN` merges, `UNSTABLE` means a check failed.
   After a force-push the old run still shows green — look at the run of the head commit.
2. `gh pr merge --squash --delete-branch`. If auto mode denies the merge, say so and wait for
   the human to re-approve; never work around the denial.
3. Move the Linear issue to Done (`mcp__linear__save_issue` with `state`; comments may be denied
   by the classifier, the state change is not).
4. Frontend changes deploy on push to `main`. Backend changes need the `Deploy backend` workflow
   with `apply=true` and the **full 40-character SHA** — the human dispatches it (see
   [deploy.md](deploy.md)).
5. If the change needs a signed-in check in production, say exactly what to click.

## Lessons the waves taught

- A worktree has no `node_modules` and no `.venv`: `npm ci` / `uv sync` first, or Turbopack and
  pyright fail in confusing ways.
- The branch-name hook denies any Bash command whose text contains a `git checkout -b` or
  `git switch -c` with an invalid name — including a `${branch}` placeholder inside a heredoc.
  Write such files with the file tool, not through the shell.
- Sub-agents may not edit `.claude/` (commands, hooks, workflows); the main session does that.
- `getByRole(name)` in Playwright matches substrings: anchor the name or use `exact: true`.
- The stack e2e (`just test-e2e-stack`) creates its trips through the API; a past trip must be
  created upcoming, filled, then patched back, because core_api locks every child write.
- The planner document never scrolls (its panes do): a full-page screenshot shows one pane's
  viewport; scroll the pane before shooting.
- One PR per concern. When the contract ties frontend and backend, one PR with both, and
  `just contracts` after every schema change.
