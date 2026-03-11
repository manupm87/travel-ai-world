# /check-site — Verify the site looks and works correctly

Use this command to verify the site after making UI or content changes. There are two modes:

---

## Mode 1: Run E2E smoke tests (automated, terminal)

```bash
cd frontend
npm run test:e2e
```

This will:
1. Auto-start the Next.js dev server on port 3000 (if not already running)
2. Run all tests in `e2e/smoke.spec.ts` with Chromium
3. Report pass / fail inline

To also open the HTML report:
```bash
cd frontend
npx playwright show-report
```

To test against the live GitHub Pages site instead of localhost:
```bash
cd frontend
PLAYWRIGHT_BASE_URL=https://manupm87.github.io/travel-ai-world npx playwright test
```

---

## Mode 2: Live browser inspection (AI agent browser tools)

Use out-of-the-box mechanisms to control the browser:
- **Antigravity Browser Subagent**: Can spawn a browser subagent to interact with the site securely.
- **Playwright MCP**: For clients like Claude Code, use the Playwright MCP server to automate browser interactions.

Ask things like:
- "Navigate to http://localhost:3000 and take a screenshot"
- "Check that the language switcher works — click ES and take a screenshot"
- "Scroll to the #features section and confirm all 6 cards are visible"
- "Check the /plan page and tell me what it shows"

> Note: The dev server (`npm run dev` in `frontend/`) must be running for localhost URLs to work.

---

## What smoke tests cover

| Test | What it checks |
|---|---|
| Page title | `<title>` contains "Travel AI World" |
| Hero headline | "Your Dream Trip" visible on load |
| Nav links | Logo + "Plan My Trip" link present |
| Language switcher | EN/ES buttons render; EN active by default |
| EN → ES switch | Nav changes to Spanish ("Cómo Funciona") |
| ES → EN switch | Nav restores to English |
| Features section | "Hyper-Personalized AI" card visible |
| Social proof | "50,000+" and "190+" stats visible |
| CTA button | "Plan My Trip Free" link visible |
| /plan stub | Title + "coming soon" + back link |
| /trip/:id stub | Back link renders without crash |
