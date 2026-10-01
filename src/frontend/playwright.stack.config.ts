import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

/**
 * Playwright config for the Compose stack as deployed (`just stack-up`): the
 * static export and the API on one origin, http://localhost:8080.
 *
 * Nothing is started or seeded here: the stack is already up, the specs create
 * the trips they need, and the signed-in ones read the session from `E2E_TOKEN` / `E2E_EMAIL`
 * (`just dev-token <email>`). Every spec runs, including the prerender checks:
 * nginx serves the same files `test:e2e:static` serves with `serve`.
 *
 *   E2E_TOKEN=$(just dev-token you@example.com) just test-e2e-stack
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  // The stack's export is built with a core_api URL (`just build-stack`), so
  // specs that skip themselves on an API-less build must run here
  // (`e2e/access.spec.ts`, the denied account).
  metadata: { apiConfigured: true },

  use: {
    ...baseConfig.use,
    baseURL,
  },

  webServer: undefined,
});
