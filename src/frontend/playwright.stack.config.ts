/**
 * Playwright config for the running Compose stack (`just stack-up`, :8080), every spec included.
 * Nothing is started or seeded; signed-in specs read `E2E_TOKEN` / `E2E_EMAIL`:
 * `E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack`.
 */

import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  // the stack's export has a core_api URL, so specs that skip on an API-less build run here
  metadata: { apiConfigured: true },

  use: {
    ...baseConfig.use,
    baseURL,
  },

  webServer: undefined,
});
