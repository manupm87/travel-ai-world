import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import { PLANNER_DRAFT_KEY } from "../src/services/plannerDraft";

/**
 * `/plan/` without `?trip=` is a new trip (TRA-223). Before it, the tab's
 * last saved trip pinned every visit to the planner: `/plan/` was sent back
 * to `/plan/?trip=<that id>`, and once that trip was deleted, to a trip that
 * was not there, with no way out.
 *
 * Runs in all three configs with no backend: the session is a fake unsigned
 * JWT (the real `E2E_TOKEN` where the runner has one, as `mobile.spec.ts`
 * does), the tab's storage is written before the first navigation exactly
 * where `services/plannerDraft.ts` keeps it, and the one trip request is
 * answered here. No turn is ever sent.
 */

const SAVED_ID = "0deb4701-42c5-4f3c-b2c6-28b9cfd66cd5";
const SAVED_TRIP_KEY = "travel_ai_planner_trip_id";
const OLD_MESSAGE = "Three days in Budapest, the trip saved earlier";

/** `en.ts`: the empty pane, and the pane of a trip that is not there. */
const EMPTY = "Your trip takes shape here";
const NOT_FOUND = "This trip isn't here";

function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

/** Signs the tab in and leaves in it a conversation saved as `SAVED_ID`. */
function seedTab(page: Page) {
  const email = process.env.E2E_EMAIL ?? "planner-new-trip@example.com";
  const token = process.env.E2E_TOKEN ?? fakeToken("planner-new-trip-e2e", email);
  const draft = {
    version: 1,
    draft: {
      messages: [{ id: "m1", kind: "text", role: "user", content: OLD_MESSAGE }],
      groups: {},
      brief: { destination: "Budapest", interests: [] },
      missing: [],
      itinerary: { stay: null, days: [], route: null, warnings: [] },
      shortlist: [],
    },
  };
  return page.addInitScript(
    ({ keys, session, tab }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
      // Once per tab: a reload must see what the page itself left behind.
      if (window.sessionStorage.getItem("e2e_seeded")) return;
      window.sessionStorage.setItem("e2e_seeded", "1");
      window.sessionStorage.setItem(keys.draft, JSON.stringify(tab.draft));
      window.sessionStorage.setItem(keys.tripId, tab.tripId);
    },
    {
      keys: {
        token: TOKEN_STORAGE_KEY,
        user: USER_STORAGE_KEY,
        draft: PLANNER_DRAFT_KEY,
        tripId: SAVED_TRIP_KEY,
      },
      session: { token, user: { id: "planner-new-trip-e2e", email, name: "Planner" } },
      tab: { draft, tripId: SAVED_ID },
    }
  );
}

test.describe("Planner — /plan/ is a new trip (TRA-223)", () => {
  test.beforeEach(async ({ page }) => {
    await seedTab(page);
    // The saved trip is gone (deleted from the home, say): core_api says 404.
    await page.route(`**/api/v1/trips/${SAVED_ID}`, (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: { message: "Trip not found", error_code: "NOT_FOUND" } }),
      })
    );
  });

  test("a tab that saved a trip opens /plan/ empty, and stays there", async ({ page }) => {
    await page.goto("/plan/");

    await expect(page.getByRole("heading", { level: 2, name: EMPTY })).toBeVisible();
    await expect(page.getByText(OLD_MESSAGE)).toHaveCount(0);
    // Give a redirect every chance to happen: it must not.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/plan\/?$/);
  });

  test("a trip that is not there offers a new one, which is an empty /plan/", async ({
    page,
  }) => {
    await page.goto(`/plan/?trip=${SAVED_ID}`);

    await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
    await page.getByRole("button", { name: "New trip" }).click();

    await expect(page).toHaveURL(/\/plan\/?$/);
    await expect(page.getByRole("heading", { level: 2, name: EMPTY })).toBeVisible();
    await expect(page.getByText(OLD_MESSAGE)).toHaveCount(0);

    // Nothing of the missing trip is left in the tab to come back to.
    await page.reload();
    await expect(page).toHaveURL(/\/plan\/?$/);
    await expect(page.getByRole("heading", { level: 2, name: EMPTY })).toBeVisible();
  });
});
