import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Travel AI World — frontend E2E smoke tests.
 *
 * Runs against the local dev server by default (http://localhost:3000).
 * To test the live GitHub Pages site, override baseURL:
 *   PLAYWRIGHT_BASE_URL=https://manupm87.github.io/travel-ai-world npx playwright test
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start the Next.js dev server automatically before tests run.
   * Remove this block if you prefer to start the server manually. */
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
