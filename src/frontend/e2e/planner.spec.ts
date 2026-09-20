import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import {
  TURNS,
  USER_MESSAGES,
  toSseBody,
  turnFor,
} from "../src/data/planner-demo/session";
import type { PlannerTurn } from "../src/types/planner";

/**
 * The planner page (`/plan/`, TRA-144) driven by the recorded Budapest
 * session: brief → neighbourhood and hotel carousels → a 3-day itinerary
 * with a chosen hotel → "Change" on day 2's afternoon.
 *
 * `ai_api`'s `/planner` route (TRA-143) answers from the corpus and a model,
 * so it is mocked here with the same fixture the unit tests use, picked per
 * turn by the message or the structured action the page sends: the e2e run
 * stays deterministic and needs no AWS. Sign-in follows
 * `trips.spec.ts`: `E2E_TOKEN` written into `localStorage` before the first
 * navigation; without it the file is skipped, so the static suite needs no
 * backend. `just test-e2e-stack` (CI's `e2e-stack` job) is the runner.
 */

const TOKEN = process.env.E2E_TOKEN;

function accountFromToken(token: string): { id: string; email: string } {
  const payload = token.split(".")[1] ?? "";
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub: string;
    email?: string;
  };
  const email = process.env.E2E_EMAIL ?? claims.email;
  if (!email) throw new Error("E2E_EMAIL is not set and the token carries no email claim");
  return { id: claims.sub, email };
}

function signIn(page: Page, token: string) {
  const { id, email } = accountFromToken(token);
  const name = email.split("@")[0] ?? email;
  return page.addInitScript(
    ({ keys, session }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: { token, user: { id, email, name } },
    }
  );
}

/** Answers `/api/v1/ai/planner` from the recorded session, like ai_api would. */
async function mockPlanner(page: Page) {
  await page.route("**/api/v1/ai/planner", async (route) => {
    const turn = route.request().postDataJSON() as PlannerTurn;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: toSseBody(TURNS[turnFor(turn)]),
    });
  });
}

const composer = (page: Page) =>
  page.getByPlaceholder("Ask for a change or search for something…");

/**
 * The map's tiles (TRA-147). OpenFreeMap is a third party: the suite blocks it
 * so the run stays offline and deterministic. MapLibre's markers are ordinary
 * DOM added when the map object is built, not when tiles arrive, so they are on
 * screen anyway — which is exactly the property worth asserting.
 */
async function blockTiles(page: Page) {
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
}

const mapPins = (page: Page) => page.locator("[data-map-stop]");

/**
 * MapLibre needs WebGL 2, and a headless Chromium without a GPU or SwiftShader
 * has none (some CI images and devcontainers). The page is built for that: the
 * map pane says so and the itinerary is untouched. The pin assertions therefore
 * run only where WebGL 2 exists, and the fallback is asserted where it does not
 * — never a skipped test, and never a flaky one.
 */
const hasWebGL = (page: Page) =>
  page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));

const MAP_UNSUPPORTED =
  "This browser cannot display the map, but your itinerary is complete on the left.";

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const card = (page: Page, title: string) => page.getByRole("article", { name: title });

/** The recorded session, up to the point where the itinerary exists. */
async function buildItinerary(page: Page) {
  await send(page, USER_MESSAGES.opening);
  const refine = page.getByRole("region", { name: "Let's refine a bit:" });
  await refine.getByLabel("From", { exact: true }).fill("2026-10-23");
  await refine.getByLabel("To", { exact: true }).fill("2026-10-25");
  await refine.getByRole("button", { name: "Confirm" }).click();
  await card(page, "Belváros").getByRole("button", { name: "Choose" }).click();
  await card(page, "Hotel Rum Budapest").getByRole("button", { name: "Choose" }).click();
  await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible();
}

test.describe("Planner page — /plan/", () => {
  test.skip(!TOKEN, "E2E_TOKEN is not set: seed an account and run `just dev-token <email>`");

  test.beforeEach(async ({ page }) => {
    await signIn(page, TOKEN!);
    await mockPlanner(page);
    await blockTiles(page);
  });

  test("from the brief to a 3-day itinerary with a chosen hotel, then a slot change", async ({
    page,
  }) => {
    await page.goto("/plan/");

    // 1. The brief: the assistant asks for the dates, the checklist shows 4/5.
    await send(page, USER_MESSAGES.opening);
    await expect(page.getByText("Which dates suit you best?")).toBeVisible();
    await expect(page.getByText("4 of 5 details ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate my trip" })).toBeDisabled();

    // 2. Quick reply for the dates: the brief is complete, the neighbourhoods arrive.
    const refine = page.getByRole("region", { name: "Let's refine a bit:" });
    await refine.getByLabel("From", { exact: true }).fill("2026-10-23");
    await refine.getByLabel("To", { exact: true }).fill("2026-10-25");
    await refine.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("5 of 5 details ready")).toBeVisible();
    const neighbourhoods = page.getByRole("region", {
      name: "Options: Where would you like to stay?",
    });
    await expect(neighbourhoods).toBeVisible();

    // 3. Pick Belváros: a chip in the transcript and the hotel carousel.
    await card(page, "Belváros").getByRole("button", { name: "Choose" }).click();
    await expect(page.getByText("Chosen: Belváros")).toBeVisible();
    await expect(card(page, "Belváros").getByRole("button", { name: "Chosen" })).toBeDisabled();
    const hotels = page.getByRole("region", { name: "Options: Pick a hotel" });
    await expect(hotels).toBeVisible();

    // 4. Pick the hotel: the panel becomes the itinerary.
    await card(page, "Hotel Rum Budapest").getByRole("button", { name: "Choose" }).click();
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible();
    await expect(page.getByText("Hotel Rum Budapest").first()).toBeVisible();
    const flights = page.getByRole("link", { name: "Search flights" }).first();
    await expect(flights).toHaveAttribute("href", /google\.com\/travel\/flights/);
    await expect(flights).toHaveAttribute("rel", /noopener/);
    // A finished itinerary opens on the trip overview (TRA-177): the whole
    // trip across both right columns, so there is no day map yet.
    const days = page.getByRole("tablist", { name: "Days" });
    await expect(days.getByRole("tab", { name: /\bDay 3\b/ })).toBeVisible();
    const dayList = page.getByRole("list", { name: "Days of the trip" });
    await expect(dayList.getByRole("button")).toHaveCount(3);
    await expect(page.getByRole("region", { name: /^Map of day/ })).toHaveCount(0);
    // A price is never a number.
    await expect(page.getByText(/\d+\s?€/)).toHaveCount(0);

    // A day's row opens that day, and the per-day view takes over.
    await page.getByRole("button", { name: /Open day 1/ }).click();
    await expect(page.getByRole("button", { name: "Change: Great Market Hall" })).toBeVisible();

    // 4b. The map column maps that same day: the hotel plus day 1's four stops,
    //     numbered identically in the panel and on the map.
    await expect(page.getByRole("region", { name: "Map of day 1" })).toBeVisible();
    const marketRow = page.getByRole("button", { name: "Open Great Market Hall" });
    await expect(marketRow).toHaveAttribute("data-stop-index", "1");
    await expect(page.getByRole("button", { name: "Open Hotel Rum Budapest" })).toHaveAttribute(
      "data-stop-index",
      "H"
    );

    const webgl = await hasWebGL(page);
    if (!webgl) {
      await expect(page.getByText(MAP_UNSUPPORTED)).toBeVisible();
      await expect(mapPins(page)).toHaveCount(0);
    } else {
      await expect(mapPins(page)).toHaveCount(5);
      await expect(mapPins(page).first()).toHaveText("H");
      // The tile pipeline runs in MapLibre's worker, served from public/
      // (TRA-181). It must be ours and alive: a worker that loads the page
      // instead of its script exits at once, and the map is pins over blank.
      await expect
        .poll(() =>
          page.workers().filter((worker) => worker.url().endsWith("/maplibre/maplibre-gl-worker.js"))
            .length
        )
        .toBeGreaterThan(0);
    }

    // 4c. Clicking a stop turns the middle column into the activity's page and
    //     highlights its pin — one pin, and only that one.
    await marketRow.click();
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toBeVisible();
    // The rest of the day is not on screen while an activity is open.
    await expect(page.getByRole("button", { name: "Change: St. Stephen's Basilica" })).toHaveCount(
      0
    );
    if (webgl) {
      await expect(page.locator('[data-map-stop][data-selected="true"]')).toHaveCount(1);
      await expect(mapPins(page).nth(1)).toHaveAttribute("aria-current", "true");
    }

    // Back to the day, and the whole day is there again.
    await page.getByRole("button", { name: "← Day 1" }).click();
    await expect(page.getByRole("button", { name: "Change: St. Stephen's Basilica" })).toBeVisible();
    await expect(marketRow).toHaveAttribute("aria-pressed", "false");

    if (webgl) {
      // A pin opens the same page. It is clicked through `dispatchEvent`
      // because the markers overlap on the canvas at this zoom.
      await mapPins(page).nth(2).dispatchEvent("click");
      await expect(page.getByRole("heading", { name: "St. Stephen's Basilica" })).toBeVisible();
      await expect(page.locator('[data-map-stop][data-selected="true"]')).toHaveCount(1);
      await page.getByRole("button", { name: "← Day 1" }).click();
    }

    // 4d. The strip's leading chip goes back to the whole trip: the overview
    //     is on screen again, whatever activity was open closes with the day,
    //     and the map column is gone with it.
    await marketRow.click();
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toBeVisible();
    await days.getByRole("tab", { name: "Whole trip" }).click();
    await expect(dayList.getByRole("button")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: /^Map of day/ })).toHaveCount(0);

    // 5. "Change" on day 2's afternoon: the strip swaps the day, then the
    //    sheet asks for the options itself.
    await days.getByRole("tab", { name: /\bDay 2\b/ }).click();
    // The map follows the strip: day 2's stops, and nothing selected any more.
    await expect(page.getByRole("region", { name: "Map of day 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Gellért Baths" })).toHaveAttribute(
      "data-stop-index",
      "2"
    );
    await expect(page.locator("[data-map-stop][aria-current]")).toHaveCount(0);
    if (webgl) await expect(mapPins(page)).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Change: Great Market Hall" })).toHaveCount(0);
    await expect(page.getByText("40 minutes on foot from the previous stop")).toBeVisible();
    await page.getByRole("button", { name: "Change: Gellért Baths" }).click();
    const sheet = page.getByRole("dialog", { name: "Day 2 · Afternoon" });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("region", { name: /Thermal baths for day 2/ })).toBeVisible();

    // 6. The alternatives are in the sheet without a second click; Rudas replaces Gellért.
    await expect(sheet.getByRole("article", { name: "Rudas Baths" })).toBeVisible();
    await sheet
      .getByRole("article", { name: "Rudas Baths" })
      .getByRole("button", { name: "Add to day 2 · Afternoon" })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText("Chosen: Rudas Baths")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change: Rudas Baths" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change: Gellért Baths" })).toHaveCount(0);

    // 7. Three columns on a laptop, tabs on a phone; the page itself never
    //    scrolls sideways at any of the three widths.
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );

    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("region", { name: "Map of day 2" })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 375, height: 800 });
    const paneTabs = page.getByRole("tablist", { name: "Plan a trip" });
    await paneTabs.getByRole("tab", { name: "Trip" }).click();
    await expect(days.getByRole("tab", { name: /\bDay 2\b/ })).toBeVisible();
    // A day is open, so the phone has its Map tab…
    await expect(paneTabs.getByRole("tab", { name: "Map" })).toBeVisible();
    // …and the overview, which spans both right columns, does not.
    await days.getByRole("tab", { name: "Whole trip" }).click();
    await expect(paneTabs.getByRole("tab", { name: "Map" })).toHaveCount(0);
    expect(await overflow()).toBeLessThanOrEqual(1);
  });

  test("on a phone the Chat / Trip tabs switch panes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/plan/");

    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    await expect(composer(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Your trips" })).toBeHidden();

    await tabs.getByRole("tab", { name: "Trip" }).click();
    // Nothing asked yet, so the trip pane is the account's trips (TRA-196);
    // the checklist takes their place as soon as the conversation starts.
    await expect(page.getByRole("heading", { level: 2, name: "Your trips" })).toBeVisible();
    await expect(composer(page)).toBeHidden();

    // No itinerary, so no day and no map: the Map tab arrives with the first
    // day the traveller opens from the overview (TRA-177).
    await expect(tabs.getByRole("tab", { name: "Map" })).toHaveCount(0);
  });

  test("without the planner route, the recorded session answers with a demo banner", async ({
    page,
  }) => {
    // Today's production shape: ai_api is deployed, /planner is not (TRA-143 pending).
    await page.unroute("**/api/v1/ai/planner");
    await page.route("**/api/v1/ai/planner", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Not Found" }),
      })
    );
    await page.goto("/plan/");

    await send(page, USER_MESSAGES.opening);
    await expect(page.getByRole("status").filter({ hasText: "Demo mode" })).toBeVisible();
    await expect(page.getByText("Which dates suit you best?")).toBeVisible({ timeout: 15_000 });

    const refine = page.getByRole("region", { name: "Let's refine a bit:" });
    await refine.getByLabel("From", { exact: true }).fill("2026-10-23");
    await refine.getByLabel("To", { exact: true }).fill("2026-10-25");
    await refine.getByRole("button", { name: "Confirm" }).click();
    await card(page, "Belváros").getByRole("button", { name: "Choose" }).click({ timeout: 15_000 });
    await card(page, "Hotel Rum Budapest").getByRole("button", { name: "Choose" }).click({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible({
      timeout: 15_000,
    });

    // "Change" on a demo slot lists three photographed alternatives by itself;
    // the slot is on day 1, which the overview opens.
    await page.getByRole("button", { name: /Open day 1/ }).click();
    await page.getByRole("button", { name: "Change: Great Market Hall" }).click();
    const sheet = page.getByRole("dialog", { name: "Day 1 · Morning" });
    await expect(sheet.getByRole("article")).toHaveCount(3, { timeout: 15_000 });
    await expect(sheet.getByRole("article").first().getByRole("img")).toHaveAttribute(
      "src",
      /commons\.wikimedia\.org/
    );
    await page.getByRole("button", { name: "Close alternatives" }).click();

    // Photos come from Wikimedia Commons, with their credit.
    const photo = card(page, "Hotel Rum Budapest").getByRole("img", { name: "Hotel Rum Budapest" });
    await expect(photo).toHaveAttribute("src", /commons\.wikimedia\.org/);

    // The banner can be hidden for the tab.
    await page.getByRole("button", { name: "Hide this notice" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo mode" })).toHaveCount(0);
  });

  test("a saved trip reopens where it was left, from the URL alone", async ({ page, request }) => {
    // Needs a real core_api: only `just test-e2e-stack` (CI's `e2e-stack`) has
    // one, and that is the run where `E2E_TOKEN` is set at all.
    await page.goto("/plan/");
    await buildItinerary(page);

    const titles = await page
      .getByRole("list", { name: "Days of the trip" })
      .getByRole("listitem")
      .allInnerTexts();
    expect(titles.length).toBe(3);

    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\?trip=[0-9a-f-]{36}/, { timeout: 30_000 });
    const tripId = new URL(page.url()).searchParams.get("trip")!;

    // A reload has no draft to restore beyond the id in the URL: everything on
    // screen now came back out of core_api.
    await page.reload();
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible();
    await expect
      .poll(async () =>
        page
          .getByRole("list", { name: "Days of the trip" })
          .getByRole("listitem")
          .allInnerTexts()
      )
      .toEqual(titles);
    await expect(page.getByText("Hotel Rum Budapest").first()).toBeVisible();

    await request.delete(`/api/v1/trips/${tripId}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
  });

  test("?q= from the landing planner sends the prompt as the first turn", async ({ page }) => {
    await page.goto(`/plan/?q=${encodeURIComponent(USER_MESSAGES.opening)}`);

    await expect(page.getByText(USER_MESSAGES.opening)).toBeVisible();
    await expect(page.getByText("Which dates suit you best?")).toBeVisible();
  });
});
