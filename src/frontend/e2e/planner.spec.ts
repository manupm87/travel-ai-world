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
 * The planner driven by the recorded Budapest session, from the brief to "Change" on day 2.
 * `/planner` is mocked with the unit tests' fixture, picked per turn, so the run is deterministic;
 * sign-in needs `E2E_TOKEN` as in `trips.spec.ts`.
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

/**
 * The recording's dates, which the mock moves a month ahead of each run: core_api locks a trip
 * once it has started (ADR 0019), so fixed dates would make the save fail after they pass.
 */
const RECORDED_DATES = { start: "2026-10-23", end: "2026-10-25" } as const;
const DAY_MS = 86_400_000;
const isoDay = (offset: number): string =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
const TRIP_DATES = { start: isoDay(30), end: isoDay(32) } as const;
const ahead = (body: string): string =>
  body
    .replaceAll(RECORDED_DATES.start, TRIP_DATES.start)
    .replaceAll(RECORDED_DATES.end, TRIP_DATES.end);

/** Answers `/api/v1/ai/planner` from the recorded session, like ai_api would. */
async function mockPlanner(page: Page) {
  await page.route("**/api/v1/ai/planner", async (route) => {
    const turn = route.request().postDataJSON() as PlannerTurn;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: ahead(toSseBody(TURNS[turnFor(turn)])),
    });
  });
}

const composer = (page: Page) =>
  page.getByPlaceholder("Ask for a change or search for something…");

/**
 * Blocks OpenFreeMap's tiles so the run stays offline and deterministic.
 * MapLibre's markers are DOM added when the map is built, not when tiles arrive, so they still show.
 */
async function blockTiles(page: Page) {
  await page.route("**/tiles.openfreemap.org/**", (route) => route.abort());
}

const mapPins = (page: Page) => page.locator("[data-map-stop]");

/**
 * Whether this Chromium has WebGL 2, which MapLibre needs: pins are asserted where it does,
 * the map pane's fallback where it doesn't, so the test is never skipped.
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
  await refine.getByLabel("From", { exact: true }).fill(TRIP_DATES.start);
  await refine.getByLabel("To", { exact: true }).fill(TRIP_DATES.end);
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

    // 1. the brief: the assistant asks for the dates, the checklist shows 4/5
    await send(page, USER_MESSAGES.opening);
    await expect(page.getByText("Which dates suit you best?")).toBeVisible();
    await expect(page.getByText("4 of 5 details ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate my trip" })).toBeDisabled();

    // 2. quick reply for the dates: the brief is complete, the neighbourhoods arrive
    const refine = page.getByRole("region", { name: "Let's refine a bit:" });
    await refine.getByLabel("From", { exact: true }).fill(TRIP_DATES.start);
    await refine.getByLabel("To", { exact: true }).fill(TRIP_DATES.end);
    await refine.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("5 of 5 details ready")).toBeVisible();
    const neighbourhoods = page.getByRole("region", {
      name: "Options: Where would you like to stay?",
    });
    await expect(neighbourhoods).toBeVisible();

    // 3. pick Belváros: a chip in the transcript and the hotel carousel
    await card(page, "Belváros").getByRole("button", { name: "Choose" }).click();
    await expect(page.getByText("Chosen: Belváros")).toBeVisible();
    await expect(card(page, "Belváros").getByRole("button", { name: "Chosen" })).toBeDisabled();
    const hotels = page.getByRole("region", { name: "Options: Pick a hotel" });
    await expect(hotels).toBeVisible();

    // 4. pick the hotel: the panel becomes the itinerary
    await card(page, "Hotel Rum Budapest").getByRole("button", { name: "Choose" }).click();
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible();
    await expect(page.getByText("Hotel Rum Budapest").first()).toBeVisible();
    const flights = page.getByRole("link", { name: "Search flights" }).first();
    await expect(flights).toHaveAttribute("href", /google\.com\/travel\/flights/);
    await expect(flights).toHaveAttribute("rel", /noopener/);
    // a finished itinerary opens on the overview: no day is mapped, the map shows the city alone
    const days = page.getByRole("tablist", { name: "Days" });
    await expect(days.getByRole("tab", { name: /\bDay 3\b/ })).toBeVisible();
    const dayList = page.getByRole("list", { name: "Days of the trip" });
    await expect(dayList.getByRole("button")).toHaveCount(3);
    await expect(page.getByRole("region", { name: /^Map of day/ })).toHaveCount(0);
    // a price is never a number
    await expect(page.getByText(/\d+\s?€/)).toHaveCount(0);

    // a day's row opens that day, and the per-day view takes over
    await page.getByRole("button", { name: /Open day 1/ }).click();
    await expect(page.getByRole("button", { name: "Change: Great Market Hall" })).toBeVisible();

    // 4b. the map shows that day: the hotel plus day 1's four stops, numbered as in the panel
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
      // the worker must be ours, from public/: one that loads the page instead exits at once,
      // leaving pins over a blank map
      await expect
        .poll(() =>
          page.workers().filter((worker) => worker.url().endsWith("/maplibre/maplibre-gl-worker.js"))
            .length
        )
        .toBeGreaterThan(0);
    }

    // 4c. a stop opens the activity's page and highlights its pin, and only that one
    await marketRow.click();
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toBeVisible();
    // the rest of the day is not on screen while an activity is open
    await expect(page.getByRole("button", { name: "Change: St. Stephen's Basilica" })).toHaveCount(
      0
    );
    if (webgl) {
      await expect(page.locator('[data-map-stop][data-selected="true"]')).toHaveCount(1);
      await expect(mapPins(page).nth(1)).toHaveAttribute("aria-current", "true");
    }

    // back to the day, and the whole day is there again
    await page.getByRole("button", { name: "← Day 1" }).click();
    await expect(page.getByRole("button", { name: "Change: St. Stephen's Basilica" })).toBeVisible();
    await expect(marketRow).toHaveAttribute("aria-pressed", "false");

    if (webgl) {
      // a pin opens the same page; `dispatchEvent` because the markers overlap at this zoom
      await mapPins(page).nth(2).dispatchEvent("click");
      await expect(page.getByRole("heading", { name: "St. Stephen's Basilica" })).toBeVisible();
      await expect(page.locator('[data-map-stop][data-selected="true"]')).toHaveCount(1);
      await page.getByRole("button", { name: "← Day 1" }).click();
    }

    // 4d. the strip's leading chip goes back to the overview, closing the day, its activity and the map
    await marketRow.click();
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toBeVisible();
    await days.getByRole("tab", { name: "Whole trip" }).click();
    await expect(dayList.getByRole("button")).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Great Market Hall" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: /^Map of day/ })).toHaveCount(0);

    // 5. "Change" on day 2's afternoon: the strip swaps the day, then the sheet asks for the options
    await days.getByRole("tab", { name: /\bDay 2\b/ }).click();
    // the map follows the strip: day 2's stops, nothing selected
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

    // 6. the alternatives are in the sheet without a second click; Rudas replaces Gellért
    await expect(sheet.getByRole("article", { name: "Rudas Baths" })).toBeVisible();
    await sheet
      .getByRole("article", { name: "Rudas Baths" })
      .getByRole("button", { name: "Add to day 2 · Afternoon" })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText("Chosen: Rudas Baths")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change: Rudas Baths" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change: Gellért Baths" })).toHaveCount(0);

    // 7. chat beside the map on a laptop, two tabs on a phone; never a sideways scroll
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
    // the map is behind the trip, in the same tab: there is no third one
    await expect(page.getByRole("region", { name: "Map of day 2" })).toBeVisible();
    await expect(paneTabs.getByRole("tab")).toHaveCount(2);
    await days.getByRole("tab", { name: "Whole trip" }).click();
    await expect(page.getByRole("region", { name: "Map of the trip" })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
  });

  test("on a phone the Chat / Trip tabs switch panes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/plan/");

    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    await expect(composer(page)).toBeVisible();
    const placeholder = page.getByRole("heading", {
      level: 2,
      name: "Your trip takes shape here",
    });
    await expect(placeholder).toBeHidden();

    await tabs.getByRole("tab", { name: "Trip" }).click();
    // nothing asked yet: the trip pane says what it is for and lists no trips
    await expect(placeholder).toBeVisible();
    await expect(composer(page)).toBeHidden();

    // two tabs, whatever the trip holds: the map lives behind the trip
    await expect(tabs.getByRole("tab")).toHaveCount(2);
  });

  test("without the planner route, the recorded session answers with a demo banner", async ({
    page,
  }) => {
    // ai_api reachable but without a /planner route
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
    await refine.getByLabel("From", { exact: true }).fill(TRIP_DATES.start);
    await refine.getByLabel("To", { exact: true }).fill(TRIP_DATES.end);
    await refine.getByRole("button", { name: "Confirm" }).click();
    await card(page, "Belváros").getByRole("button", { name: "Choose" }).click({ timeout: 15_000 });
    await card(page, "Hotel Rum Budapest").getByRole("button", { name: "Choose" }).click({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible({
      timeout: 15_000,
    });

    // "Change" on a demo slot lists three photographed alternatives by itself
    await page.getByRole("button", { name: /Open day 1/ }).click();
    await page.getByRole("button", { name: "Change: Great Market Hall" }).click();
    const sheet = page.getByRole("dialog", { name: "Day 1 · Morning" });
    await expect(sheet.getByRole("article")).toHaveCount(3, { timeout: 15_000 });
    await expect(sheet.getByRole("article").first().getByRole("img")).toHaveAttribute(
      "src",
      /commons\.wikimedia\.org/
    );
    await page.getByRole("button", { name: "Close alternatives" }).click();

    // photos come from Wikimedia Commons, with their credit
    const photo = card(page, "Hotel Rum Budapest").getByRole("img", { name: "Hotel Rum Budapest" });
    await expect(photo).toHaveAttribute("src", /commons\.wikimedia\.org/);

    // the banner can be hidden for the tab
    await page.getByRole("button", { name: "Hide this notice" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo mode" })).toHaveCount(0);
  });

  test("a saved trip reopens where it was left, from the URL alone", async ({ page, request }) => {
    // needs a real core_api, which only the stack run (the one with `E2E_TOKEN`) has
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

    // after the reload everything on screen came back from core_api, not the draft
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

    await request.delete(`${process.env.E2E_API_URL ?? ""}/api/v1/trips/${tripId}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
  });

  test("?q= from the landing planner sends the prompt as the first turn", async ({ page }) => {
    await page.goto(`/plan/?q=${encodeURIComponent(USER_MESSAGES.opening)}`);

    await expect(page.getByText(USER_MESSAGES.opening)).toBeVisible();
    await expect(page.getByText("Which dates suit you best?")).toBeVisible();
  });
});
