import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests — Kyrian World landing page
 *
 * These tests cover the critical user-facing paths on the landing page.
 * They are intentionally broad (smoke, not unit) to catch regressions quickly.
 */
const visibleHeader = (page: Page) =>
  page.locator("header").filter({ visible: true });

const visibleNav = (page: Page) =>
  page.getByRole("navigation").filter({ visible: true });

// The group's accessible name is translated, so it changes with the language.
const LANGUAGE_GROUP_NAME = /Select language|Seleccionar idioma/;

/** Language and theme live in the footer's single line, not in the header. */
const languageGroup = (page: Page) =>
  page.getByRole("contentinfo").getByRole("group", { name: LANGUAGE_GROUP_NAME });

async function chooseLanguage(page: Page, name: RegExp) {
  await languageGroup(page).getByRole("button", { name }).click();
}

test.describe("Landing page — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title is set correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/Kyrian World/i);
  });

  test("hero headline is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Your Dream Trip/i }).first()
    ).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    const header = visibleHeader(page);
    await expect(
      header.getByRole("link", { name: /Kyrian World/i })
    ).toBeVisible();
    await expect(header.getByRole("button", { name: /Sign in/i })).toBeVisible();
  });

  test("language switcher shows English by default", async ({ page }) => {
    await expect(
      languageGroup(page).getByRole("button", { name: /English/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("switching to Spanish translates nav links", async ({ page }) => {
    await chooseLanguage(page, /Español/);

    await expect(
      visibleNav(page).getByRole("link", { name: /Cómo Funciona/i })
    ).toBeVisible();
    await expect(
      languageGroup(page).getByRole("button", { name: /Español/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("switching back to English restores nav", async ({ page }) => {
    await chooseLanguage(page, /Español/);
    await chooseLanguage(page, /English/);

    await expect(
      visibleNav(page).getByRole("link", { name: /How It Works/i })
    ).toBeVisible();
  });

  test("features section renders feature cards", async ({ page }) => {
    // No manual scroll: the node can be swapped during hydration and
    // `scrollIntoViewIfNeeded` then fails with "not attached". `toBeVisible`
    // auto-waits and does not need the element in the viewport.
    await expect(page.locator("#features").first()).toBeAttached();
    await expect(page.getByText(/Hyper-Personalized AI/i).first()).toBeVisible();
  });

  test("social proof stats are rendered", async ({ page }) => {
    await expect(page.getByText("50,000+", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("190+", { exact: true }).first()).toBeVisible();
  });

  test("'Plan My Trip Free' CTA button is visible", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Plan My Trip Free/i }).first()
    ).toBeVisible();
  });
});

test.describe("Trip planner — #planner", () => {
  test("planner section renders and accepts a prompt", async ({ page }) => {
    await page.goto("/");

    const planner = page.locator("#planner").filter({ visible: true });
    await planner.scrollIntoViewIfNeeded();

    await expect(
      planner.getByRole("heading", { name: /Tell the AI where you want to go/i })
    ).toBeVisible();

    const input = planner.getByPlaceholder(/7-day trip to Lisbon/i);
    await expect(input).toBeVisible();

    await input.fill("Three days in Porto on a small budget");
    await expect(input).toHaveValue("Three days in Porto on a small budget");
  });
});
