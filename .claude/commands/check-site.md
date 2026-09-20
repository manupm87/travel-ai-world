# /check-site — Verify the site looks and works correctly

Use after UI or content changes. Two modes.

## Mode 1: automated tests (Playwright), three configs

```bash
just test-e2e                      # starts `next dev` on :3000 and runs src/frontend/e2e/smoke.spec.ts
just test-e2e-static               # `next build` served on :3100: smoke + e2e/prerender.spec.ts (CI's `frontend` job)
just test-e2e-stack                # the running Compose stack on :8080, every spec incl. the signed-in e2e/trips.spec.ts and e2e/planner.spec.ts (mocked /ai/planner)
cd src/frontend && npx playwright show-report
PLAYWRIGHT_BASE_URL=https://manupm87.github.io/travel-ai-world npx playwright test   # against the live site
```

The stack mode (needs Docker) is the production shape and the only one with a backend, so the
signed-in suite runs there: seed an account, mint its token, run.

```bash
just stack-up
just seed you@example.com
E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
```

`trips.spec.ts` writes `E2E_TOKEN` (and `E2E_EMAIL`, defaulting to the token's `email` claim) into
`localStorage` before the first navigation and skips itself when `E2E_TOKEN` is unset, so the first
two modes need no backend. CI's `e2e-stack` job runs exactly this flow (`docs/runbooks/docker.md`).

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
- "Open the language menu, choose ES and confirm the nav reads 'Cómo Funciona'"
- "Scroll to #features and confirm the feature cards are visible"
- "Go to /dashboard and check the planner card accepts a prompt"

**Signed-in inspection without Google.** `core_api` in local mode accepts a token minted from the
shell for any existing account (`just seed` creates one with the four demo trips):

```bash
just seed you@example.com
just dev-token you@example.com       # prints the JWT; the account's id is its `sub` claim
```

Then, with `just dev-core` and `just dev-frontend` (or the stack on :8080) running, drive the
browser: `browser_navigate` to `http://localhost:3000/`, `browser_evaluate` with
`localStorage.setItem("travel_ai_token", "<jwt>"); localStorage.setItem("travel_ai_user",
JSON.stringify({ id: "<sub>", email: "you@example.com", name: "you" }))` (the keys and the profile
shape come from `src/services/session.ts`), then `browser_navigate` to `/dashboard/` or
`/trip/?id=<uuid>`. Signing out is `localStorage.clear()` and a reload.

## What the smoke tests cover

| Test | What it checks |
|---|---|
| Page title | `<title>` contains "Travel AI World" |
| Hero headline | "Your Dream Trip" visible on load |
| Nav links | Logo and primary links present |
| Language switcher | 🇬🇧 by default; switching to ES translates the nav and back |
| Features section | "Hyper-Personalized AI" card visible |
| Social proof | "50,000+" and "190+" stats visible |
| CTA | "Plan My Trip Free" link visible |
| Planner | the prompt input renders and accepts text |
| Mobile (every config) | at 390 x 844: `/` does not scroll sideways and its CTA and drawer work; `/plan/` does not scroll at all, the Chat/Trip tabs and the whole composer are inside the viewport |
| Prerender (static and stack configs) | `/` arrives as full HTML before hydration; `/trip/?id=` is one shell, `/trip/<id>/` a 404 |
| Trips (stack config, `E2E_TOKEN` set) | `/dashboard/` lists the four seeded trips under their sections; a card and a deep link open `/trip/?id=<uuid>` with the Japan trip's header, timeline and itinerary; an unknown id shows the not-found state; signed out, `/dashboard/` redirects to `/?redirect=` |
