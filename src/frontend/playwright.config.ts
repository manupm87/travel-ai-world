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

/**
 * The environment Chromium is launched with: ours, minus `WAYLAND_DISPLAY`.
 *
 * VS Code forwards the host's Wayland socket (WSLg) into the devcontainer as
 * `WAYLAND_DISPLAY`. With it set, ANGLE's SwiftShader backend insists on the
 * `VK_KHR_wayland_surface` extension, which SwiftShader does not have, the GPU
 * process exits and the page gets no WebGL at all — MapLibre then shows its
 * "map unavailable" fallback and `planner.spec.ts` never reaches the pins
 * (TRA-180). Without the variable the same Chromium reports WebGL 2 over
 * SwiftShader. Harmless where the variable is not set (CI, macOS, Linux
 * desktops), and a string-only object because Playwright's `env` is typed so.
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
    // The planner's map is WebGL (MapLibre, TRA-147) and CI has no GPU, so
    // Chromium renders it with SwiftShader — which recent builds only allow
    // behind this flag. Without it MapLibre throws and the page shows the
    // "map unavailable" fallback instead of pins.
    launchOptions: { args: ["--enable-unsafe-swiftshader"], env: browserEnv() },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start the Next.js dev server automatically before tests run.
   * Remove this block if you prefer to start the server manually. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
