/**
 * Playwright config for the E2E tests, against `npm run dev` on :3000 by default.
 * Another deployment: `PLAYWRIGHT_BASE_URL=https://<domain> npx playwright test`.
 */

import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * The environment Chromium is launched with: ours, minus `WAYLAND_DISPLAY`.
 * With it set (VS Code forwards WSLg's socket into the devcontainer), SwiftShader
 * needs `VK_KHR_wayland_surface`, which it lacks, so the page gets no WebGL and no map.
 */
function browserEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== "WAYLAND_DISPLAY" && value !== undefined) env[key] = value;
  }
  return env;
}

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/prerender.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // the map is WebGL and CI has no GPU; recent Chromium allows SwiftShader only behind this flag
    launchOptions: { args: ["--enable-unsafe-swiftshader"], env: browserEnv() },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
