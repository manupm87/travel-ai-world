import { test, expect } from "@playwright/test";

/**
 * Smoke tests — Travel AI World landing page
 *
 * These tests cover the critical user-facing paths on the landing page.
 * They are intentionally broad (smoke, not unit) to catch regressions quickly.
 *
 * Run with: npm run test:e2e
 */

test.describe("Landing page — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title is set correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/Travel AI World/i);
  });

  test("hero headline is visible", async ({ page }) => {
    // The hero title contains "Your Dream Trip" — check it renders
    await expect(
      page.getByRole("heading", { name: /Your Dream Trip/i }).first()
    ).toBeVisible();
  });

  test("navigation links are present", async ({ page }) => {
    // Use CSS selector to scope to the <header> element
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: /Travel AI World/i })).toBeVisible();
    await expect(header.getByRole("link", { name: /Plan My Trip/i })).toBeVisible();
  });

  test("language switcher is visible and shows EN active by default", async ({ page }) => {
    // Target language buttons by their uppercase text content
    // Buttons render as: "🇬🇧 EN" and "🇪🇸 ES"
    const header = page.locator("header").first();
    await expect(header.getByRole("button", { name: "EN" })).toBeVisible();
    await expect(header.getByRole("button", { name: "ES" })).toBeVisible();
  });

  test("switching to Spanish translates nav links", async ({ page }) => {
    const header = page.locator("header").first();
    // Click the ES button — use exact text to avoid matching travel style pill buttons
    await header.getByRole("button", { name: "ES" }).click();

    // After switching, the nav link should change to Spanish.
    await expect(
      page.getByRole("navigation").getByRole("link", { name: /Cómo Funciona/i })
    ).toBeVisible();
  });

  test("switching back to English restores nav", async ({ page }) => {
    const header = page.locator("header").first();
    await header.getByRole("button", { name: "ES" }).click();
    await header.getByRole("button", { name: "EN" }).click();
    // Scope to nav to avoid matching the same string in section headings / footer
    await expect(
      page.getByRole("navigation").getByRole("link", { name: /How It Works/i })
    ).toBeVisible();
  });

  test("features section renders feature cards", async ({ page }) => {
    await page.locator("#features").scrollIntoViewIfNeeded();
    // Check one of the feature card titles from en.ts
    await expect(page.getByText(/Hyper-Personalized AI/i)).toBeVisible();
  });

  test("social proof stats are rendered", async ({ page }) => {
    // Use exact match to avoid matching the trust badge in the hero ("✓ 50,000+ trips planned")
    await expect(page.getByText("50,000+", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("190+", { exact: true }).first()).toBeVisible();
  });

  test("'Plan My Trip Free' CTA button is visible", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Plan My Trip Free/i }).first()
    ).toBeVisible();
  });
});

test.describe("Planner stub page — /plan", () => {
  test("loads and shows the coming soon message", async ({ page }) => {
    await page.goto("/plan/");
    await expect(page.getByText(/Trip Planner/i).first()).toBeVisible();
    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to Home/i })).toBeVisible();
  });
});

// Note: /trip/[id] is a dynamic Next.js route with generateStaticParams.
// In static export mode only pre-rendered IDs (from generateStaticParams) are valid at build time.
// The route shell is verified indirectly via the /plan page test above.
// Add specific trip IDs here once the backend generates real IDs.
