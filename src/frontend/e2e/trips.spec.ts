import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";

/**
 * Signed-in journeys over real data: the dashboard and the trip viewer read
 * the four demo trips (`just seed <email>`) from core_api.
 *
 * Sign-in needs no identity provider. `E2E_TOKEN` is a local-mode JWT for
 * the seeded account (`just dev-token <email>`); each test writes it, and the
 * profile the UI shows, into `localStorage` before the first navigation,
 * exactly where `src/services/session.ts` keeps a real session. Without
 * `E2E_TOKEN` the whole file is skipped, so `just test-e2e` and
 * `just test-e2e-static` (no backend) run as before. `just test-e2e-stack`
 * is the intended runner (the Compose origin, :8080), and CI's `e2e-stack` job.
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

/** Titles from `core_api/seed/data/*.json`, keyed by the dashboard section they land in. */
const SEEDED = {
  planned: ["Grand European Tour: Paris, Rome & Barcelona"],
  planning: ["Japan Explorer: Traditions & Neon"],
  finished: ["New York Weekend", "Prague, Vienna & Budapest"],
} as const;

/** `en.ts` `dashboard.sections`, the labels above each group of cards. */
const SECTION_LABEL = {
  planned: "Your Next Adventure",
  planning: "In the works",
  finished: "Past journeys",
} as const;

const JAPAN = SEEDED.planning[0];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TRIP_URL = /\/trip\/\?id=[0-9a-f-]{36}$/;

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

async function expectJapanViewer(page: Page) {
  await expect(page).toHaveURL(TRIP_URL);
  // Header: the title and the status badge.
  await expect(page.getByRole("heading", { level: 1, name: JAPAN })).toBeVisible();
  await expect(page.getByText("Planning", { exact: true }).first()).toBeVisible();
  // Timeline: the three destinations as clickable nodes.
  await expect(page.getByRole("heading", { name: "Route Overview" })).toBeVisible();
  for (const city of ["Tokyo", "Kyoto", "Osaka"]) {
    await expect(page.getByRole("button", { name: city }).first()).toBeVisible();
  }
  // Itinerary: 2026-10-01 to 2026-10-14, and the first day's title.
  await expect(page.getByRole("heading", { name: "Your 14-Day Journey" })).toBeVisible();
  await expect(page.getByText("Arrival in Neon City").first()).toBeVisible();
}

test.describe("Signed in with a minted local token", () => {
  test.skip(!TOKEN, "E2E_TOKEN is not set: seed an account and run `just dev-token <email>`");

  test.beforeEach(async ({ page }) => {
    await signIn(page, TOKEN!);
  });

  test("the dashboard lists the four seeded trips, each under its section", async ({
    page,
  }) => {
    await page.goto("/dashboard/");

    for (const status of ["planned", "planning", "finished"] as const) {
      const section = page
        .locator("section")
        .filter({ has: page.getByText(SECTION_LABEL[status], { exact: true }) });
      await expect(section).toBeVisible();
      for (const title of SEEDED[status]) {
        await expect(
          section.getByRole("heading", { level: 3, name: title })
        ).toBeVisible();
      }
    }
  });

  test("a card opens the viewer at /trip/?id=<uuid> with header, timeline and itinerary", async ({
    page,
  }) => {
    await page.goto("/dashboard/");

    const card = page.getByRole("link", { name: JAPAN });
    await expect(card).toHaveAttribute("href", TRIP_URL);
    await card.click();

    await expectJapanViewer(page);
  });

  test("a deep link to the trip renders the same viewer", async ({ page }) => {
    // The id is only known at run time: read it off the dashboard, then load
    // the viewer's URL directly (a full navigation, not a client-side route).
    await page.goto("/dashboard/");
    const href = await page.getByRole("link", { name: JAPAN }).getAttribute("href");
    expect(href).toMatch(TRIP_URL);
    const id = new URL(href!, page.url()).searchParams.get("id");
    expect(id).toMatch(UUID);

    await page.goto(`/trip/?id=${encodeURIComponent(id!)}`);

    await expectJapanViewer(page);
  });

  test("an id that belongs to no trip shows the not-found state", async ({ page }) => {
    await page.goto("/trip/?id=3f2504e0-4f89-11d3-9a0c-0305e82c3301");

    await expect(
      page.getByRole("heading", { name: "We couldn't find that trip" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my trips" })).toHaveAttribute(
      "href",
      /\/dashboard\/?$/
    );
    // Not found is not an error: no retry state (Next's route announcer is a
    // `role="alert"` too, so the check is on the copy, not the role).
    await expect(page.getByRole("heading", { name: "We couldn't load your trip" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  });
});

test.describe("Signed out", () => {
  test.skip(!TOKEN, "runs with the signed-in suite only (`just test-e2e-stack`)");

  test("/dashboard/ sends the visitor home, remembering where to come back to", async ({
    page,
  }) => {
    await page.goto("/dashboard/");

    await expect(page).toHaveURL(/\/\?redirect=%2Fdashboard%2F$/);
    await expect(page.getByRole("heading", { name: /Your Dream Trip/i }).first()).toBeVisible();
  });
});
