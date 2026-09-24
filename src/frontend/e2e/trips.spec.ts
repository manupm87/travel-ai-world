import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import { ACTIVITIES, HOTELS, RESTAURANTS } from "../src/data/planner-demo/session";

/**
 * Saved trips: listed on the signed-in home and nowhere else (TRA-199,
 * TRA-201), read and changed in the planner (TRA-196).
 *
 * There is no seed any more, so this suite writes the trips it needs through
 * the REST API before it starts and deletes them after — one upcoming trip,
 * which the planner reopens and can still change, and one that is already
 * over, which it reopens read-only. Both carry the planner's own cards
 * (`card` JSON, `source_ref`, `part_of_day`), because that is what
 * `services/tripDraft.ts` rebuilds the draft from.
 *
 * Sign-in needs no identity provider. `E2E_TOKEN` is a local-mode JWT
 * (`just dev-token <email>`, which creates the account if it is new); each
 * test writes it, and the profile the UI shows, into `localStorage` before
 * the first navigation, exactly where `src/services/session.ts` keeps a real
 * session. Without `E2E_TOKEN` the whole file is skipped, so `just test-e2e`
 * and `just test-e2e-static` (no backend) run as before. `just
 * test-e2e-stack` is the intended runner (the Compose origin, :8080), and
 * CI's `e2e-stack` job.
 */

const TOKEN = process.env.E2E_TOKEN;

/** The account behind `E2E_TOKEN`: `E2E_EMAIL`, or the token's own `email` claim. */
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
      // Profile first, then the token: a token seen alone resolves to nobody.
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: { token, user: { id, email, name } },
    }
  );
}

const DAY_MS = 86_400_000;

/** The composer's label: the planner's own field, among the checklist's. */
const COMPOSER = "Tell the AI where you want to go";

/** A date `offset` days from today, as core_api stores one. */
const isoDay = (offset: number): string =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

/** `en.ts` `plan.trips.groups`, the heading over each group of the list. */
const GROUP = {
  ongoing: "Happening now",
  upcoming: "Coming up",
  past: "Already been",
} as const;

interface NewTrip {
  title: string;
  /** Days from today the trip starts on; it lasts `days` days. */
  startsIn: number;
  days: number;
}

/**
 * One trip as the planner saves it: the city columns, the days, and on every
 * day a card of the recorded Budapest session — the same shape
 * `saveDraftAsTrip` writes, so reopening it exercises the real round trip.
 */
async function createTrip(api: APIRequestContext, { title, startsIn, days }: NewTrip) {
  const start = isoDay(startsIn);
  const end = isoDay(startsIn + days - 1);
  // core_api refuses every write on a trip that is not upcoming, its children
  // included (ADR 0019), so a trip that is already over cannot be built in
  // place: it is written far ahead, filled, and moved back with the one PATCH
  // it will still accept — the last write of its life.
  const alreadyOver = startsIn < 0;
  const created = await api.post("/api/v1/trips/", {
    data: {
      title,
      city_slug: "budapest",
      city: "Budapest",
      country: "Hungary",
      country_code: "HU",
      lat: 47.4979,
      lng: 19.0402,
      origin: "Madrid",
      budget_tier: 2,
      start_date: alreadyOver ? isoDay(365) : start,
      end_date: alreadyOver ? isoDay(365 + days - 1) : end,
      duration_days: days,
      travelers_adults: 2,
      travelers_children: 0,
      travelers_infants: 0,
      travel_style: ["food", "history"],
      pace_preference: "balanced",
      budget_currency: "EUR",
      image_url: HOTELS.rum.image_url,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  await api.post(`/api/v1/trips/${id}/accommodations/`, {
    data: {
      name: HOTELS.rum.title,
      type: "hotel",
      city: "Budapest",
      country_code: "HU",
      source_ref: HOTELS.rum.id,
      card: HOTELS.rum,
      lat: HOTELS.rum.lat,
      lng: HOTELS.rum.lon,
    },
  });

  for (let day = 1; day <= days; day++) {
    const saved = await api.post(`/api/v1/trips/${id}/itinerary-days/`, {
      data: {
        day_number: day,
        date: new Date(Date.parse(`${start}T00:00:00Z`) + (day - 1) * DAY_MS)
          .toISOString()
          .slice(0, 10),
        title: `Day ${day} in Budapest`,
      },
    });
    const { id: dayId } = (await saved.json()) as { id: string };

    await api.post(`/api/v1/trips/${id}/itinerary-days/${dayId}/activities/`, {
      data: {
        title: ACTIVITIES.greatMarket.title,
        description: ACTIVITIES.greatMarket.why,
        category: ACTIVITIES.greatMarket.category,
        part_of_day: "morning",
        time: "10:00",
        source_ref: ACTIVITIES.greatMarket.id,
        card: ACTIVITIES.greatMarket,
        booking_required: false,
        location_name: ACTIVITIES.greatMarket.title,
        location_city: "Budapest",
        location_lat: ACTIVITIES.greatMarket.lat,
        location_lng: ACTIVITIES.greatMarket.lon,
      },
    });
    await api.post(`/api/v1/trips/${id}/itinerary-days/${dayId}/meals/`, {
      data: {
        restaurant_name: RESTAURANTS.menza.title,
        type: "dinner",
        cuisine: RESTAURANTS.menza.subtitle,
        part_of_day: "evening",
        time: "19:00",
        source_ref: RESTAURANTS.menza.id,
        card: RESTAURANTS.menza,
        location_name: RESTAURANTS.menza.title,
        location_city: "Budapest",
        location_lat: RESTAURANTS.menza.lat,
        location_lng: RESTAURANTS.menza.lon,
      },
    });
  }

  if (alreadyOver) {
    const moved = await api.patch(`/api/v1/trips/${id}`, {
      data: { start_date: start, end_date: end },
    });
    expect(moved.ok(), await moved.text()).toBeTruthy();
  }

  return id;
}

test.describe("Trips: listed on the home, lived in the planner", () => {
  test.skip(!TOKEN, "E2E_TOKEN is not set: run `just dev-token <email>` first");

  /** A run-specific suffix, so two runs against one database never collide. */
  const stamp = Date.now();
  const UPCOMING = `E2E upcoming ${stamp}`;
  const PAST = `E2E past ${stamp}`;

  let api: APIRequestContext;
  let upcomingId: string;
  let pastId: string;
  const disposable: string[] = [];

  test.beforeAll(async ({ playwright }, testInfo) => {
    api = await playwright.request.newContext({
      baseURL: testInfo.project.use.baseURL,
      extraHTTPHeaders: { authorization: `Bearer ${TOKEN}` },
    });
    upcomingId = await createTrip(api, { title: UPCOMING, startsIn: 30, days: 3 });
    pastId = await createTrip(api, { title: PAST, startsIn: -40, days: 2 });
  });

  test.afterAll(async () => {
    for (const id of [upcomingId, pastId, ...disposable]) {
      if (id) await api.delete(`/api/v1/trips/${id}`);
    }
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, TOKEN!);
  });

  test("the planner lists no trips: it waits for the one it is about to make", async ({
    page,
  }) => {
    await page.goto("/plan/");

    await expect(
      page.getByRole("heading", { level: 2, name: "Your trip takes shape here" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: GROUP.upcoming })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: GROUP.past })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 4, name: UPCOMING })).toHaveCount(0);
  });

  test("the planner's header pill goes back to the home", async ({ page }) => {
    await page.goto("/plan/");

    await page.getByRole("link", { name: "Your trips" }).click();

    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.getByRole("heading", { level: 2, name: "Your trips" })).toBeVisible();
  });

  test("opening an upcoming trip shows its days and leaves the planner working", async ({
    page,
  }) => {
    await page.goto("/dashboard/");
    await page.getByRole("link", { name: UPCOMING }).click();

    await expect(page).toHaveURL(new RegExp(`/plan/?\\?trip=${upcomingId}$`));
    await expect(page.getByRole("heading", { name: "3 days in Budapest" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Day 1/ })).toBeVisible();
    await expect(page.getByText(HOTELS.rum.title).first()).toBeVisible();
    // Still plannable: the composer is there and so is "Save trip".
    await expect(page.getByRole("textbox", { name: COMPOSER })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save trip" })).toBeVisible();
  });

  test("a trip that is over is read, not planned", async ({ page }) => {
    await page.goto(`/plan/?trip=${pastId}`);

    await expect(
      page.getByText("This trip is over. It stays here as it was.")
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save trip" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start over" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Change/ })).toHaveCount(0);
    // What it holds is all still there to read.
    await expect(page.getByRole("heading", { name: "2 days in Budapest" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Day 2/ })).toBeVisible();
  });

  test("the card's menu renames a trip, keyboard only, and it stays renamed", async ({ page }) => {
    const title = `E2E rename ${Date.now()}`;
    const id = await createTrip(api, { title, startsIn: 60, days: 2 });
    disposable.push(id);

    await page.goto("/dashboard/");
    // Every step is a named control the keyboard can reach, and the menu and
    // the dialog both answer to Enter.
    await page.getByRole("button", { name: `Options for ${title}` }).press("Enter");
    await page.getByRole("menuitem", { name: "Rename trip" }).press("Enter");

    const dialog = page.getByRole("dialog", { name: "Rename trip" });
    await expect(dialog).toBeVisible();
    const renamed = `${title} (renamed)`;
    await dialog.getByLabel("Title").fill(renamed);
    await dialog.getByRole("button", { name: "Save title" }).press("Enter");

    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 4, name: renamed })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 4, name: renamed })).toBeVisible();
    // `exact`, because the new title carries the old one inside it.
    await expect(
      page.getByRole("heading", { level: 4, name: title, exact: true })
    ).toHaveCount(0);
  });

  test("a trip can be deleted, once the confirmation is answered", async ({ page }) => {
    const title = `E2E delete ${Date.now()}`;
    const id = await createTrip(api, { title, startsIn: 90, days: 1 });

    await page.goto("/dashboard/");
    await expect(page.getByRole("heading", { level: 4, name: title })).toBeVisible();

    await page.getByRole("button", { name: `Options for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Delete trip" }).click();

    const confirm = page.getByRole("dialog", { name: "Delete this trip?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete trip" }).click();

    await expect(confirm).toBeHidden();
    await expect(page.getByRole("heading", { level: 4, name: title })).toHaveCount(0);

    // And it is gone from the API too, not just from the page.
    await page.reload();
    await expect(page.getByRole("heading", { level: 4, name: title })).toHaveCount(0);
    expect((await api.get(`/api/v1/trips/${id}`)).status()).toBe(404);
  });

  test("an id that belongs to no trip says so in the trip pane", async ({ page }) => {
    await page.goto("/plan/?trip=3f2504e0-4f89-11d3-9a0c-0305e82c3301");

    await expect(page.getByRole("heading", { name: "This trip isn't here" })).toBeVisible();
    // The chat column is untouched: a bad link does not take the planner down.
    await expect(page.getByRole("textbox", { name: COMPOSER })).toBeVisible();
  });

  test("the old viewer's links land in the planner", async ({ page }) => {
    await page.goto(`/trip/?id=${upcomingId}`);
    await expect(page).toHaveURL(new RegExp(`/plan/?\\?trip=${upcomingId}$`));
  });

  test("the home lists the trips and opens one", async ({ page }) => {
    await page.goto("/dashboard/");

    // The field first, then the trips under their own heading.
    await expect(page.getByRole("heading", { level: 1, name: "Where next?" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Where next?" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Your trips" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: GROUP.upcoming })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: GROUP.past })).toBeVisible();

    // The one that is over opens read-only…
    await page.getByRole("link", { name: PAST }).click();
    await expect(page).toHaveURL(new RegExp(`/plan/?\\?trip=${pastId}$`));
    await expect(page.getByText("This trip is over. It stays here as it was.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save trip" })).toHaveCount(0);

    // …and the one still ahead opens as it was planned.
    await page.goto("/dashboard/");
    await page.getByRole("link", { name: UPCOMING }).click();
    await expect(page).toHaveURL(new RegExp(`/plan/?\\?trip=${upcomingId}$`));
    await expect(page.getByRole("textbox", { name: COMPOSER })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save trip" })).toBeVisible();
  });

  test("the home's ask opens the planner with it", async ({ page }) => {
    await page.goto("/dashboard/");

    await page
      .getByRole("textbox", { name: "Where next?" })
      .fill("Four days in Budapest, thermal baths");
    await page.getByRole("button", { name: "Plan it" }).click();

    await expect(page).toHaveURL(/\/plan\/?\?q=Four%20days%20in%20Budapest/);
  });

  test("a new trip starts from the home, in an empty planner", async ({ page }) => {
    await page.goto("/dashboard/");
    await page.getByRole("link", { name: "New trip" }).click();

    await expect(page).toHaveURL(/\/plan\/?$/);
    await expect(page.getByRole("textbox", { name: COMPOSER })).toBeVisible();
  });
});

test.describe("Signed out", () => {
  test.skip(!TOKEN, "runs with the signed-in suite only (`just test-e2e-stack`)");

  test("/plan/ sends the visitor home, remembering where to come back to", async ({ page }) => {
    await page.goto("/plan/");

    await expect(page).toHaveURL(/\/\?redirect=%2Fplan%2F$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Where to?");
    // The landing opens the sign-in dialog for a visitor the guard turned away.
    await expect(page.getByRole("dialog", { name: "Sign in to plan" })).toBeVisible();
  });
});
