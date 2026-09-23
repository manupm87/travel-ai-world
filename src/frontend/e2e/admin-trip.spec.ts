import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import { ADMIN_TRIP_PAGE, ADMIN_USER_PAGE, turnSummary } from "../src/test/fixtures/admin";
import { BUDAPEST as BUDAPEST_CITY } from "../src/test/fixtures/planner-city";
import BUDAPEST, { TRIP_ID } from "../src/test/fixtures/trip-budapest";

/**
 * The admin trip page (TRA-229): anyone's saved trip, read only, with the
 * turns of the planner session that made it. Every API route is mocked with
 * `page.route` and the session is the fake one `admin.spec.ts` writes, so it
 * runs in every config and needs no backend.
 */

const SESSION = "sess-trip-1";
const OWNER = BUDAPEST.user_id;
/** The fixture with a planner session; the shared file itself stays as it is. */
const TRIP = { ...BUDAPEST, planner_session_id: SESSION };
const TRIP_URL = `/admin/trip/?user=${OWNER}&id=${TRIP_ID}`;

const SESSION_PAGE = {
  items: [
    turnSummary({ turn_id: "01J8TRIPTURN00000000000001", session_id: SESSION }),
    turnSummary({
      turn_id: "01J8TRIPTURN00000000000002",
      ts: "2026-09-23T09:20:00Z",
      session_id: SESSION,
      trip_id: TRIP_ID,
      action: "save",
    }),
  ],
  next_cursor: null,
};

type Role = "admin" | "user";

const path = (pathname: string) => (url: URL) => url.pathname === pathname;

function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

/** Signs in as `admin.spec.ts` does: the profile in storage, `/users/me` mocked. */
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
        token: process.env.E2E_TOKEN ?? fakeToken(me.subject ?? "sub", me.email),
        user: { id: me.id, email: me.email, name: me.name, role },
      },
    }
  );
  await page.route(path("/api/v1/users/me"), (route) => route.fulfill({ json: me }));
}

async function mockApi(page: Page, trip: typeof TRIP | typeof BUDAPEST = TRIP) {
  await page.route(path("/api/v1/admin/users"), (route) => route.fulfill({ json: ADMIN_USER_PAGE }));
  await page.route(path("/api/v1/admin/trips"), (route) =>
    route.fulfill({
      json: {
        ...ADMIN_TRIP_PAGE,
        items: [{ ...ADMIN_TRIP_PAGE.items[0]!, id: TRIP_ID, user_id: OWNER }],
      },
    })
  );
  await page.route(path(`/api/v1/admin/trips/${OWNER}/${TRIP_ID}`), (route) =>
    route.fulfill({ json: trip })
  );
  await page.route(path("/api/v1/ai/planner/cities"), (route) =>
    route.fulfill({ json: [BUDAPEST_CITY] })
  );
  await page.route(path(`/api/v1/ai/admin/sessions/${SESSION}`), (route) =>
    route.fulfill({ json: SESSION_PAGE })
  );
}

const turnsTable = (page: Page) =>
  page.getByRole("table", { name: "Turns of this trip's planner session, oldest first" });

test.describe("Admin trip page — as an administrator", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
  });

  test("header, overview, a day's cards and the session's turns", async ({ page }) => {
    await mockApi(page);
    await page.goto(TRIP_URL);

    await expect(page.getByRole("heading", { level: 1, name: TRIP.title, exact: true })).toBeVisible();
    await expect(page.getByText("Ada Lovelace · ada@example.com", { exact: true })).toBeVisible();
    await expect(page.locator('[data-tone="accent"]', { hasText: "Ahead" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Admin console" }).getByRole("link", { name: "Trips", exact: true })
    ).toHaveAttribute("aria-current", "page");

    // The overview: the stay and the trip's days.
    await expect(page.getByText(TRIP.accommodations[0]!.name).first()).toBeVisible();
    const days = page.getByRole("list", { name: "Days of the trip" }).getByRole("button");
    await expect(days).toHaveCount(TRIP.itinerary_days.length);

    // Selecting a day shows its cards, read only.
    await days.nth(1).click();
    const day = page.locator('[data-admin-day="2"]');
    await expect(day.getByRole("heading", { name: "Day 2 in detail", exact: true })).toBeVisible();
    // Focus follows the day in, and goes back to its row when it closes.
    await expect(day.getByRole("heading", { name: "Day 2 in detail", exact: true })).toBeFocused();
    await expect(day.locator("[data-stop-row]")).toHaveCount(4);
    await expect(day.getByRole("button", { name: /^Change/ })).toHaveCount(0);
    await expect(day.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
    await day.getByRole("button", { name: "Close the day", exact: true }).click();
    await expect(day).toHaveCount(0);
    await expect(days.nth(1)).toBeFocused();

    // The turns of the session, each linking to the inspector.
    await expect(page.getByText("2 turns", { exact: true })).toBeVisible();
    const rows = turnsTable(page).locator("tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.first().getByRole("link")).toHaveAttribute(
      "href",
      /\/admin\/turn\/?\?id=01J8TRIPTURN00000000000001$/
    );
    await expect(rows.nth(1).getByRole("link")).toHaveAttribute(
      "href",
      /\/admin\/turn\/?\?id=01J8TRIPTURN00000000000002$/
    );
  });

  test("a row of the trips list leads here", async ({ page }) => {
    await mockApi(page);
    await page.goto("/admin/trips/");
    await page
      .getByRole("table", { name: "Every saved trip, newest first" })
      .getByRole("link", { name: ADMIN_TRIP_PAGE.items[0]!.title, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/trip/?\\?user=${OWNER}&id=${TRIP_ID}$`));
    await expect(page.getByRole("heading", { level: 1, name: TRIP.title, exact: true })).toBeVisible();
  });

  test("a trip saved before sessions says so", async ({ page }) => {
    await mockApi(page, BUDAPEST);
    await page.goto(TRIP_URL);
    await expect(page.getByRole("heading", { level: 1, name: TRIP.title, exact: true })).toBeVisible();
    await expect(
      page.getByText("This trip was saved before sessions were recorded.", { exact: true })
    ).toBeVisible();
    await expect(turnsTable(page)).toHaveCount(0);
  });

  test("a malformed id is not found, without a request", async ({ page }) => {
    let asked = false;
    await mockApi(page);
    await page.route(
      (url) => url.pathname.startsWith("/api/v1/admin/trips/"),
      (route) => {
        asked = true;
        return route.fulfill({ status: 404, json: { detail: "not found" } });
      }
    );
    await page.goto(`/admin/trip/?user=${OWNER}&id=not-a-trip`);
    await expect(
      page.getByText("There is no such trip. It may have been deleted.", { exact: true })
    ).toBeVisible();
    expect(asked).toBe(false);
  });
});

test.describe("Admin trip page — on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("never scrolls sideways, with a day open", async ({ page }) => {
    await signIn(page, "admin");
    await mockApi(page);
    await page.goto(TRIP_URL);
    await expect(turnsTable(page).locator("tbody tr")).toHaveCount(2);
    await page.getByRole("list", { name: "Days of the trip" }).getByRole("button").first().click();
    await expect(page.locator('[data-admin-day="1"]')).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});

test.describe("Admin trip page — as a traveller", () => {
  test("a non-admin gets 'not allowed'", async ({ page }) => {
    await signIn(page, "user");
    await mockApi(page);
    await page.goto(TRIP_URL);
    await expect(page.getByTestId("admin-not-allowed")).toBeVisible();
    await expect(page.getByText("Ada Lovelace · ada@example.com")).toHaveCount(0);
  });
});
