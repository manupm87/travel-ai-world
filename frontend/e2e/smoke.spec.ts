import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests — Travel AI World landing page
 *
 * These tests cover the critical user-facing paths on the landing page.
 * They are intentionally broad (smoke, not unit) to catch regressions quickly.
 */
const visibleHeader = (page: Page) =>
  page.locator("header").filter({ visible: true });

const visibleNav = (page: Page) =>
  page.getByRole("navigation").filter({ visible: true });

const languageTrigger = (page: Page) =>
  visibleHeader(page).getByRole("button", { name: "Select language" });

const languageSwitcher = (page: Page) =>
  visibleHeader(page)
    .locator(".dropdown-container")
    .filter({ has: page.getByRole("button", { name: "Select language" }) });

async function openLanguageMenu(page: Page) {
  await languageTrigger(page).click();
  return languageSwitcher(page);
}

test.describe("Landing page — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title is set correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/Travel AI World/i);
  });

  test("hero headline is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Your Dream Trip/i }).first()
    ).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    const header = visibleHeader(page);
    await expect(
      header.getByRole("link", { name: /Travel AI World/i })
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: /Plan My Trip/i })
    ).toBeVisible();
  });

  test("language switcher shows English by default", async ({ page }) => {
    await expect(languageTrigger(page)).toContainText("🇬🇧");
  });

  test("switching to Spanish translates nav links", async ({ page }) => {
    const menu = await openLanguageMenu(page);
    await menu.getByRole("button", { name: /Español/ }).click();

    await expect(
      visibleNav(page).getByRole("link", { name: /Cómo Funciona/i })
    ).toBeVisible();
    await expect(languageTrigger(page)).toContainText("🇪🇸");
  });

  test("switching back to English restores nav", async ({ page }) => {
    let menu = await openLanguageMenu(page);
    await menu.getByRole("button", { name: /Español/ }).click();

    menu = await openLanguageMenu(page);
    await menu.getByRole("button", { name: /English/ }).click();

    await expect(
      visibleNav(page).getByRole("link", { name: /How It Works/i })
    ).toBeVisible();
  });

  test("features section renders feature cards", async ({ page }) => {
    await page.locator("#features").first().scrollIntoViewIfNeeded();
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
