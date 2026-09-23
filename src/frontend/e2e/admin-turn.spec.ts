import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import { ADMIN_USER_PAGE } from "../src/test/fixtures/admin";
import {
  CHAT_TURN,
  CHAT_TURN_ID,
  INSPECTOR_SESSION_ID,
  INSPECTOR_SESSION_PAGE,
  INSPECTOR_TURN,
  INSPECTOR_TURN_ID,
} from "../src/test/fixtures/admin-turn";

/**
 * The turn inspector (TRA-228). The turn and its session are mocked with
 * `page.route` from `src/test/fixtures/admin-turn.ts`, and the session is a
 * fake unsigned JWT with an admin profile, as `admin.spec.ts` signs in. So it
 * runs in every config and needs no backend.
 */

const path = (pathname: string) => (url: URL) => url.pathname === pathname;
const prefix = (start: string) => (url: URL) =>
  url.pathname.startsWith(start) && url.pathname.length > start.length;

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

/** Any turn id answers the rich turn, except the chat turn's; the session answers its three turns. */
async function mockApi(page: Page) {
  await page.route(prefix("/api/v1/ai/admin/turns/"), (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop() ?? "");
    return route.fulfill({ json: id === CHAT_TURN_ID ? CHAT_TURN : INSPECTOR_TURN });
  });
  await page.route(path(`/api/v1/ai/admin/sessions/${INSPECTOR_SESSION_ID}`), (route) =>
    route.fulfill({ json: INSPECTOR_SESSION_PAGE })
  );
}

const PHASES = ["Open the suitcase", "Look in the wardrobe", "Fold and fit", "Weigh the suitcase", "Zip it up"];
const open = (page: Page, id = INSPECTOR_TURN_ID) => page.goto(`/admin/turn/?id=${id}`);

test.describe("Turn inspector — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await mockApi(page);
  });

  test("shows the figures, the phases, the model calls, the events and the city-kb results", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { name: "What the traveller saw", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What is not seen", exact: true })).toBeVisible();

    await expect(page.locator("[data-chip]")).toHaveCount(6);
    await expect(page.locator('[data-chip="action"]')).toContainText("select:hotels:erzsebetvaros");
    await expect(page.locator('[data-chip="searches"]')).toContainText("+1 by id");

    for (const phase of PHASES) {
      await expect(page.getByRole("heading", { name: phase, exact: true })).toBeVisible();
    }

    const calls = page.getByRole("tablist", { name: "Model calls", exact: true });
    await expect(calls.getByRole("tab")).toHaveCount(INSPECTOR_TURN.summary.llm_calls);
    await calls.getByRole("tab", { name: "DayPicks, day 2", exact: true }).click();
    await expect(page.locator('[data-validation="repairs"]')).toHaveText("1 repair");

    await expect(page.getByTestId("events-count")).toHaveText("12 events");

    const kb = page.getByRole("table", { name: "Results of search 6", exact: true });
    await expect(kb.locator("tbody tr")).toHaveCount(8);
    await expect(kb.getByRole("img", { name: "Used", exact: true }).first()).toBeVisible();
  });

  test("mark 1 scrolls to the SSE events and focuses their heading", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Go to the SSE events", exact: true }).click();
    const heading = page.getByRole("heading", { name: "SSE events", exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
  });

  test("mark 3 leads to the step that warned", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Go to the step that warned", exact: true }).click();
    await expect(page.locator("#turn-step-18")).toBeFocused();
  });

  test("a waterfall row opens its step with Enter", async ({ page }) => {
    await open(page);
    const row = page.locator("#turn-step-18");
    await row.focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator("#turn-step-18-panel");
    await expect(panel).toContainText("Day 2 has more activities than the balanced pace allows (4).");
    await page.keyboard.press("Enter");
    await expect(row).toHaveAttribute("aria-expanded", "false");
  });

  test("a search's step leads to its city-kb panel", async ({ page }) => {
    await open(page);
    await page.locator("#turn-step-10").click();
    await page.getByRole("button", { name: "Go to its city-kb panel", exact: true }).click();
    await expect(page.locator("#turn-kb-10")).toBeFocused();
  });

  test("previous and next move within the session", async ({ page }) => {
    await open(page);
    await expect(page.getByTestId("turn-position")).toHaveText("Turn 2 of 3");
    await page.getByRole("button", { name: "Next turn", exact: true }).click();
    await expect(page).toHaveURL(/[?&]id=01J8TURN00000000000000SES3$/);
    await page.goto(`/admin/turn/?id=${INSPECTOR_TURN_ID}`);
    await expect(page.getByTestId("turn-position")).toHaveText("Turn 2 of 3");
    await page.getByRole("button", { name: "Previous turn", exact: true }).click();
    await expect(page).toHaveURL(/[?&]id=01J8TURN00000000000000SES1$/);
  });

  test("the chat turn: no session, only the answer's mark", async ({ page }) => {
    await open(page, CHAT_TURN_ID);
    await expect(page.getByRole("heading", { name: "What is not seen", exact: true })).toBeVisible();
    const traveller = page.getByRole("region", { name: "What the traveller saw", exact: true });
    await expect(traveller.getByText("Is Széchenyi open on Mondays?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to the SSE events", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Go to the step that warned", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Go to the city-kb search", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("turn-position")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next turn", exact: true })).toHaveCount(0);
  });

  test("Export JSON still downloads the turn", async ({ page }) => {
    await open(page);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    expect((await download).suggestedFilename()).toBe(`turn-${INSPECTOR_TURN_ID}.json`);
  });
});

test.describe("Turn inspector — on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await mockApi(page);
  });

  const width = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

  test("the sheet opens, its four tabs work, and nothing scrolls sideways", async ({ page }) => {
    await open(page);
    await expect(page.getByRole("heading", { name: "What the traveller saw", exact: true })).toBeVisible();
    const sheet = page.getByRole("region", { name: "What is not seen", exact: true });
    await expect(sheet).toBeVisible();
    expect(await width(page)).toBeLessThanOrEqual(390);

    const handle = sheet.getByRole("button", { name: "Show what is not seen", exact: true });
    await handle.click();
    await expect(sheet.getByRole("button", { name: "Hide what is not seen", exact: true })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(sheet.locator("[data-stat]")).toHaveCount(4);

    const tabs = sheet.getByRole("tablist", { name: "Inspector sections", exact: true });
    const expectations: [string, () => Promise<void>][] = [
      ["Trace", () => expect(sheet.getByRole("heading", { name: "Turn trace", exact: true })).toBeVisible()],
      [
        "city-kb",
        () => expect(sheet.getByRole("table", { name: "Results of search 6", exact: true })).toBeVisible(),
      ],
      ["Model", () => expect(sheet.getByRole("tablist", { name: "Model calls", exact: true })).toBeVisible()],
      ["Events", () => expect(sheet.getByTestId("events-count")).toHaveText("12 events")],
    ];
    for (const [name, check] of expectations) {
      const tab = tabs.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await check();
      expect(await width(page)).toBeLessThanOrEqual(390);
    }
  });

  test("Enter on the handle opens the sheet and Escape folds it", async ({ page }) => {
    await open(page);
    const sheet = page.getByRole("region", { name: "What is not seen", exact: true });
    await sheet.getByRole("button", { name: "Show what is not seen", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(sheet.getByRole("tablist", { name: "Inspector sections", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet.getByRole("tablist")).toHaveCount(0);
  });

  test("a mark opens the sheet on the right tab", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Go to the city-kb search", exact: true }).click();
    const sheet = page.getByRole("region", { name: "What is not seen", exact: true });
    await expect(sheet.getByRole("tab", { name: "city-kb", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#turn-kb-2")).toBeFocused();
    expect(await width(page)).toBeLessThanOrEqual(390);
  });
});
