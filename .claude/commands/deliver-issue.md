Deliver a Linear issue with the agent wave: audit and brief in this session, then implement,
review and fix through the `kyrian-wave` workflow.

Usage: `/deliver-issue TRA-123`

The practice is described in `AGENTS.md` ("How work is delivered") and
`docs/runbooks/agent-delivery.md`; this command is its Claude Code entry point.

Steps:

1. Fetch the issue with `mcp__linear__get_issue` (key from `$ARGUMENTS`). No key or no issue →
   stop and ask for it (or create the issue with `mcp__linear__save_issue` when the user has
   described the work: outcome, files, acceptance list).
2. Audit here, in this session: read every file the change touches (routes, hooks, services,
   tests, docs) and take the design decisions. Do not delegate decisions.
3. Pick the branch name `<type>/TRA-<n>-<slug>` (same rules as `/start-issue`; the hook checks it).
4. Write the brief to `${CLAUDE_JOB_DIR:-/tmp}/brief-TRA-<n>.md` with the sections of the runbook:
   Decisions (already taken), Tests, Docs (same PR), Ground rules for the agents. Mirror the
   outcome and the acceptance list into the issue description if they are not there yet.
5. Launch the wave:

   `Workflow({ name: "kyrian-wave", args: { issue: "TRA-<n>", branch: "<branch>", briefPath: "<path>" } })`

   Optional args: `checks` (default `just lint`, `just test-frontend`, `just test-e2e-static`;
   add `just test-core` / `just test-ai` for backend work) and `base` (default `main`).
   Move the issue to "In Progress" with `mcp__linear__save_issue`.
6. While it runs, do only work that does not touch the same files (docs, the next brief).
   On completion read the result: deviations, skipped findings, CI state.
7. Ship as the runbook says: `gh pr view --json mergeStateStatus` must be `CLEAN` on the head
   commit, then `gh pr merge --squash --delete-branch`; if auto mode denies the merge, tell the
   user and wait. Move the issue to Done. Backend changes: tell the user the `Deploy backend`
   dispatch (full SHA, `apply=true`) is theirs.

Never edit `.claude/` from inside the wave; that is this session's job.
