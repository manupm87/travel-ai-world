Start work on a Linear issue: read it, create the branch, and report the plan.

Usage: `/start-issue TRA-123`

Steps:

1. Fetch the issue with the Linear MCP (`mcp__linear__get_issue` with the key from `$ARGUMENTS`).
   If there is no argument or the issue does not exist, stop and ask for the key.
2. Pick the branch type from the issue: `feat` for features and stories, `fix` for bugs,
   `docs`, `infra`, `build`, `ci`, `test`, `refactor` or `chore` when the title or labels say so.
3. Derive the slug from the title: lowercase, ASCII, words joined by `-`, at most five words.
4. Create the branch from an up-to-date `main`:

   ```bash
   git checkout main && git pull --ff-only && git checkout -b <type>/TRA-<n>-<slug>
   ```

   The branch-name hook rejects anything outside `<type>/TRA-<n>-<slug>`; fix the name, never the hook.
5. If the issue is not already in progress, move it with `mcp__linear__update_issue` (state "In Progress")
   and assign it to the current user if unassigned.
6. Summarise the issue (goal, acceptance criteria, open questions) in a few lines and propose the
   first steps. Do not start coding until the user confirms the plan, unless they asked for it.

When the PR is opened later: its body includes `Closes TRA-<n>`, and its URL is posted on the issue
with `mcp__linear__create_comment`.
