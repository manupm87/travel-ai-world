import { test, expect, type Page, type Route } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import {
  ADMIN_TRIP_PAGE,
  ADMIN_USER_PAGE,
  ADA_SUBJECT,
  GRACE_SUBJECT,
  TRACE_STATS,
  TURN_DETAIL,
  TURN_PAGE,
  turnSummary,
} from "../src/test/fixtures/admin";

/**
 * The admin console (TRA-222). Every API route it calls is mocked with
 * `page.route` from `src/test/fixtures/admin.ts`, and the session is a fake
 * unsigned JWT written into `localStorage` as `mobile.spec.ts` does, with the
 * role in the stored profile (the static build has no core_api to ask) and
 * `/api/v1/users/me` mocked for the configs that do. So it runs in every
 * config and needs no backend.
 */

type Role = "admin" | "user";

/** Matches exactly one API path, whatever the origin and the query. */
const path = (pathname: string) => (url: URL) => url.pathname === pathname;
/** Matches every API path under a prefix. */
const prefix = (start: string) => (url: URL) =>
  url.pathname.startsWith(start) && url.pathname.length > start.length;

function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

async function signIn(page: Page, role: Role) {
  const me = { ...ADMIN_USER_PAGE.items[role === "admin" ? 0 : 1]!, role };
  await page.addInitScript(
    ({ keys, session }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: {
        // Against a real backend (the Compose stack) the dashboard asks core_api
        // for the account's trips as it opens, and a made-up token comes back
        // 401 and drops the session (see `mobile.spec.ts`): the runner's real
        // `E2E_TOKEN` wins whenever it has one.
        token: process.env.E2E_TOKEN ?? fakeToken(me.subject ?? "sub", me.email),
        user: { id: me.id, email: me.email, name: me.name, role },
      },
    }
  );
  await page.route(path("/api/v1/users/me"), (route) => route.fulfill({ json: me }));
}

/** The turns route: narrowed by `subject`, and a second page when `pages` is 2. */
async function mockApi(page: Page, { turnPages = 1 }: { turnPages?: 1 | 2 } = {}) {
  await page.route(path("/api/v1/ai/admin/stats"), (route) => route.fulfill({ json: TRACE_STATS }));
  await page.route(path("/api/v1/ai/admin/turns"), (route: Route) => {
    const url = new URL(route.request().url());
    const subject = url.searchParams.get("subject");
    const cursor = url.searchParams.get("cursor");
    if (cursor === "PAGE2") {
      return route.fulfill({
        json: {
          items: [turnSummary({ turn_id: "01J8TURN0000000000000000D4", ts: "2026-09-23T12:00:00Z" })],
          next_cursor: null,
        },
      });
    }
    const items = subject ? TURN_PAGE.items.filter((t) => t.subject === subject) : TURN_PAGE.items;
    return route.fulfill({ json: { items, next_cursor: turnPages === 2 ? "PAGE2" : null } });
  });
  await page.route(prefix("/api/v1/ai/admin/turns/"), (route) => route.fulfill({ json: TURN_DETAIL }));
  await page.route(path("/api/v1/admin/users"), (route) => route.fulfill({ json: ADMIN_USER_PAGE }));
  await page.route(path("/api/v1/admin/trips"), (route) => route.fulfill({ json: ADMIN_TRIP_PAGE }));
}

const consoleNav = (page: Page) => page.getByRole("navigation", { name: "Admin console" });
const table = (page: Page, caption: string) => page.getByRole("table", { name: caption });

test.describe("Admin console — as an administrator", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
    await mockApi(page);
  });

  test("the overview: four nav entries, seven figures and the chart", async ({ page }) => {
    await page.goto("/admin/");

    const nav = consoleNav(page);
    for (const name of ["Overview", "Turns", "Trips", "Users"]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(page.locator("[data-kpi]")).toHaveCount(7);
    await expect(page.locator('[data-kpi="turns"]')).toContainText("91");
    await expect(page.getByRole("img", { name: /^Turns per day by status/ })).toBeVisible();
    await expect(page.locator("[data-day]")).toHaveCount(7);
    await expect(table(page, "By model")).toContainText("meta/llama-3.3-70b-instruct");
  });

  test("switches the range to 30 days in the URL", async ({ page }) => {
    await page.goto("/admin/");
    const thirty = page.getByRole("button", { name: "30 days", exact: true });
    await thirty.click();
    await expect(page).toHaveURL(/[?&]range=30/);
    await expect(thirty).toHaveAttribute("aria-pressed", "true");
  });

  test("the header links administrators to the console", async ({ page }) => {
    await page.goto("/dashboard/");
    const link = page.getByRole("banner").getByRole("link", { name: "Admin", exact: true });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/admin\/?$/);
  });

  test("turns: three rows, the user filter narrows them, rows link to the turn", async ({ page }) => {
    await page.goto("/admin/turns/");
    const turns = table(page, "Turns of the selected day, newest first");
    await expect(turns.locator("tbody tr")).toHaveCount(3);
    await expect(turns).toContainText("Ada Lovelace");
    await expect(turns).toContainText("Grace Hopper");

    const first = turns.locator("tbody tr").first().getByRole("link");
    await expect(first).toHaveAttribute("href", /\/admin\/turn\/?\?id=01J8TURN0000000000000000A1$/);

    await page.getByLabel("User").selectOption({ label: "Grace Hopper" });
    await expect(page).toHaveURL(new RegExp(`subject=${GRACE_SUBJECT}`));
    await expect(turns.locator("tbody tr")).toHaveCount(1);
    await expect(turns).not.toContainText("Ada Lovelace");
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  });

  test("turns: 'Load more' reads the next page", async ({ page }) => {
    await page.unrouteAll();
    await signIn(page, "admin");
    await mockApi(page, { turnPages: 2 });
    await page.goto("/admin/turns/");

    const turns = table(page, "Turns of the selected day, newest first");
    await expect(turns.locator("tbody tr")).toHaveCount(3);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(turns.locator("tbody tr")).toHaveCount(4);
  });

  test("users show their subject and lead to their turns", async ({ page }) => {
    await page.goto("/admin/users/");
    const users = table(page, "Every account");
    await expect(users.locator("tbody tr")).toHaveCount(2);
    await expect(users).toContainText(ADA_SUBJECT.slice(0, 8));
    await expect(users).toContainText(GRACE_SUBJECT.slice(0, 8));
    await expect(
      users.getByRole("button", { name: `Copy the subject ${ADA_SUBJECT}` })
    ).toBeVisible();
    await expect(users.getByRole("link", { name: "Turns" }).first()).toHaveAttribute(
      "href",
      new RegExp(`/admin/turns/?\\?subject=${ADA_SUBJECT}`)
    );
  });

  test("trips show their owners", async ({ page }) => {
    await page.goto("/admin/trips/");
    const trips = table(page, "Every saved trip, newest first");
    await expect(trips.locator("tbody tr")).toHaveCount(2);
    await expect(trips).toContainText("Ada Lovelace");
    await expect(trips).toContainText("Grace Hopper");
    await expect(trips.getByRole("link", { name: "Budapest in October" })).toHaveAttribute(
      "href",
      /\/admin\/trip\/?\?user=.+&id=.+/
    );
  });

  test("the turn page shows the summary and exports the JSON", async ({ page }) => {
    await page.goto("/admin/turn/?id=01J8TURN0000000000000000A1");
    await expect(page.getByRole("heading", { name: "Turn", exact: true })).toBeVisible();
    await expect(page.getByText("01J8TURN0000000000000000A1", { exact: true })).toBeVisible();
    await expect(consoleNav(page).getByRole("link", { name: "Turns", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    expect((await download).suggestedFilename()).toBe("turn-01J8TURN0000000000000000A1.json");
  });

  test("the keyboard reaches the range picker and the first row link", async ({ page }) => {
    await page.goto("/admin/");
    await expect(page.locator("[data-kpi]")).toHaveCount(7);

    const reach = async (predicate: string, limit = 40) => {
      for (let i = 0; i < limit; i++) {
        await page.keyboard.press("Tab");
        if (await page.evaluate(predicate)) return true;
      }
      return false;
    };

    expect(
      await reach(`document.activeElement?.closest('[role="group"][aria-label="Range"]') !== null`)
    ).toBe(true);

    await page.goto("/admin/turns/");
    await expect(page.locator("tbody tr")).toHaveCount(3);
    expect(
      await reach(`document.activeElement?.closest("tbody") !== null && document.activeElement?.tagName === "A"`)
    ).toBe(true);
  });
});

test.describe("Admin console — on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
    await mockApi(page);
  });

  for (const path of ["/admin/", "/admin/turns/", "/admin/users/", "/admin/trips/"]) {
    test(`${path} never scrolls sideways`, async ({ page }) => {
      await page.goto(path);
      await expect(consoleNav(page)).toBeVisible();
      await expect(page.locator("table").first()).toBeVisible();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(390);
    });
  }

  test("the turn detail never scrolls sideways", async ({ page }) => {
    await page.goto(`/admin/turn/?id=${TURN_DETAIL.summary.turn_id}`);
    await expect(consoleNav(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Turn", exact: true })).toBeVisible();
    for (const summary of await page.locator("details > summary").all()) await summary.click();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });

});

test.describe("Admin console — as a traveller", () => {
  test("a non-admin gets 'not allowed' and no Admin link", async ({ page }) => {
    await signIn(page, "user");
    await mockApi(page);
    await page.goto("/admin/turns/");

    await expect(page.getByTestId("admin-not-allowed")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This area is for administrators." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(consoleNav(page)).toHaveCount(0);
  });
});
