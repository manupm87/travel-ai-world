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

async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const card = (page: Page, title: string) => page.getByRole("article", { name: title });

test.describe("Planner page — /plan/", () => {
  test.skip(!TOKEN, "E2E_TOKEN is not set: seed an account and run `just dev-token <email>`");

  test.beforeEach(async ({ page }) => {
    await signIn(page, TOKEN!);
    await mockPlanner(page);
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
    await expect(page.getByRole("button", { name: /\bDay 3\b/ })).toBeVisible();
    // A price is never a number.
    await expect(page.getByText(/\d+\s?€/)).toHaveCount(0);

    // 5. "Change" on day 2's afternoon: the sheet asks for the options itself.
    await page.getByRole("button", { name: /\bDay 2\b/ }).click();
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
  });

  test("on a phone the Chat / Trip / Map tabs switch panes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/plan/");

    const tabs = page.getByRole("tablist");
    await expect(tabs).toBeVisible();
    await expect(composer(page)).toBeVisible();
    await expect(page.getByText("Your trip is taking shape")).toBeHidden();

    await tabs.getByRole("tab", { name: "Trip" }).click();
    await expect(page.getByText("Your trip is taking shape")).toBeVisible();
    await expect(composer(page)).toBeHidden();

    await tabs.getByRole("tab", { name: "Map" }).click();
    await expect(page.getByText(/The map arrives with the next release/)).toBeVisible();
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

    // "Change" on a demo slot lists three photographed alternatives by itself.
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

  test("?q= from the landing planner sends the prompt as the first turn", async ({ page }) => {
    await page.goto(`/plan/?q=${encodeURIComponent(USER_MESSAGES.opening)}`);

    await expect(page.getByText(USER_MESSAGES.opening)).toBeVisible();
    await expect(page.getByText("Which dates suit you best?")).toBeVisible();
  });
});
