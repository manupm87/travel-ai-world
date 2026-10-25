# /check-site — Verify the site looks and works correctly

Use after UI or content changes. Two modes.

## Mode 1: automated tests (Playwright), three configs

```bash
just test-e2e          # `next dev` on :3000: every spec in src/frontend/e2e/ but prerender.spec.ts
just test-e2e-static   # `next build` served on :3100: every spec, prerender.spec.ts included (CI's `frontend` job)
just test-e2e-stack    # the running Compose stack on :8080: every spec, with the API configured (CI's `e2e-stack` job)
cd src/frontend && npx playwright show-report
PLAYWRIGHT_BASE_URL=https://kyrian-world.com npx playwright test   # against the live site
```

Most specs mock the API with `page.route` and fake the session, so they need no backend. The
signed-in specs that hit a real core_api (`trips.spec.ts`, `planner.spec.ts`) skip themselves
without `E2E_TOKEN`; run them against the stack, or against `just dev-core` + `just dev-frontend`
with `PLAYWRIGHT_BASE_URL=http://localhost:3000 E2E_API_URL=http://localhost:8000` (the
devcontainer's way, since it has no Docker; details in `docs/runbooks/local-dev.md#end-to-end-tests`):

```bash
just stack-up
E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
```

Which config runs what, and the `E2E_EMAIL` override: `docs/runbooks/local-dev.md`, "End-to-end tests".

## Mode 2: live browser inspection (Playwright MCP)

The server is declared in the repo's `.mcp.json` (`@playwright/mcp`, a frontend devDependency,
headless Chromium, isolated profile). It needs `npm install` in `src/frontend` and Chromium
(`npx playwright install --with-deps chromium`, done by the devcontainer's post-create). Claude
Code asks once to trust the project server; `/mcp` shows whether `playwright` is connected.
Tools are `mcp__playwright__browser_*` (`navigate`, `snapshot`, `click`, `type`,
`take_screenshot`, `console_messages`, `network_requests`, ...). Prefer `browser_snapshot`
(accessibility tree, cheap) over screenshots unless the check is visual.

`.mcp.json` also declares `playwright-host`: the same server attached over the Chrome DevTools
Protocol to a browser running on the **host** (`host.docker.internal:9222`). Use it from the
devcontainer when a visible, logged-in browser is wanted. The "Claude in Chrome" extension
(`claude --chrome`) is not supported in WSL or containers. On the host, start Chrome with a
dedicated profile (Chrome refuses remote debugging on the default one):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="$env:LOCALAPPDATA\chrome-claude"
```

With `just dev-frontend` running, drive the browser through it:

- "Navigate to <http://localhost:3000> and take a screenshot"
- "Open the language menu, choose Español and confirm the heading reads '¿A dónde vamos?'"
- "Type an ask in the field, press 'Plan it' and confirm the sign-in dialog opens"
- "Signed in, go to /dashboard/ and check the trips are listed; open one in the planner"

**Signed-in inspection without Google.** Mint a token and write it into `localStorage` as
`docs/runbooks/local-dev.md`, "Signing in without Google", describes; from the MCP that is one
`browser_evaluate` on `http://localhost:3000/`, then `browser_navigate` to `/dashboard/` or
`/plan/?trip=<id>`. Signing out is `localStorage.clear()` and a reload.

## What the smoke tests cover

`e2e/smoke.spec.ts`, the landing `/`:

| Test | What it checks |
|---|---|
| Page title | `<title>` contains "Kyrian World" |
| One question, one field, one action | a single h1 "Where to?", the ask field, "Plan it" disabled while empty |
| The ask needs an account | filled, "Plan it" enables; clicked signed out, it opens the "Sign in to plan" dialog and stays on `/` |
| Header | the wordmark link and "Sign in", and no other link |
| Language | English by default; Español translates the heading and the action, and back |
| Theme | the toggle switches `data-theme` from dark to light and back |

The other specs cover the phone layout (`mobile.spec.ts`: `/`, `/dashboard/` and `/plan/` at
390 x 844), the static HTML (`prerender.spec.ts`), the planner (`planner*.spec.ts`), the admin
console (`admin*.spec.ts`), the access list (`access.spec.ts`) and the saved trips
(`trips.spec.ts`: listed on `/dashboard/`, the signed-in home (ADR 0020), reopened in the planner,
which lists none). Each file's header says what it mocks.
