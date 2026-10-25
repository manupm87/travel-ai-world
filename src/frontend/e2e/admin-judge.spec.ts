import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import {
  ADMIN_USER_PAGE,
  EVAL_ITEM,
  EVAL_RUN_ANSWERS,
  EVAL_RUN_GOLDEN,
  EVAL_RUN_GOLDEN_DETAIL,
} from "../src/test/fixtures/admin";

/**
 * The LLM judge. The runs, a judge check's stream and a run's detail are mocked from
 * `src/test/fixtures/admin.ts` and the session is faked as in `admin.spec.ts`, so no backend.
 */

const path = (pathname: string) => (url: URL) => url.pathname === pathname;

function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

async function signInAsAdmin(page: Page) {
  const me = { ...ADMIN_USER_PAGE.items[0]!, role: "admin" as const };
  await page.addInitScript(
    ({ keys, session }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: {
        token: process.env.E2E_TOKEN ?? fakeToken(me.subject ?? "sub", me.email),
        user: { id: me.id, email: me.email, name: me.name, role: "admin" },
      },
    }
  );
  await page.route(path("/api/v1/users/me"), (route) => route.fulfill({ json: me }));
}

const STREAM = [
  { type: "progress", done: 1, total: 2, item: EVAL_ITEM },
  { type: "report", run: EVAL_RUN_GOLDEN },
]
  .map((event) => `data: ${JSON.stringify(event)}\n\n`)
  .join("")
  .concat("data: [DONE]\n\n");

async function mockApi(page: Page) {
  await page.route(path("/api/v1/ai/admin/answer-evals"), (route) =>
    route.fulfill({ json: { items: [EVAL_RUN_ANSWERS] } })
  );
  await page.route(path("/api/v1/ai/admin/answer-evals/run-golden"), (route) =>
    route.fulfill({ json: EVAL_RUN_GOLDEN_DETAIL })
  );
  await page.route(path("/api/v1/ai/admin/answer-eval"), (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: STREAM })
  );
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
]) {
  test.describe(`LLM judge — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeEach(async ({ page }) => {
      await signInAsAdmin(page);
      await mockApi(page);
    });

    test("checks the judge, shows the agreement and opens the run", async ({ page }) => {
      await page.goto("/admin/judge/");
      await expect(page.getByRole("heading", { name: "LLM judge", exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: "groundedness 4.72, relevance 4.98" })).toBeVisible();
      await expect(page.getByText("Last run: groundedness 4.72, relevance 4.98")).toBeVisible();
      await expect(page.getByText("judge_validation", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Check the judge" }).click();
      await expect(page.getByRole("table", { name: "Agreement by score" })).toBeVisible();

      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(viewport.width);

      await page.getByRole("link", { name: "Open run" }).click();
      await expect(page.getByRole("heading", { name: "Every item (2)" })).toBeVisible();
      await expect(page.getByText("Defect put in: wrong-currency").last()).toBeVisible();
    });
  });
}
