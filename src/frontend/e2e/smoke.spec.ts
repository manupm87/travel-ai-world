import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests — the Kyrian World landing page.
 *
 * The landing is one question, one field and one action (TRA-190), so this
 * suite is exactly that: the field takes an ask, the ask needs an account, and
 * the reader's own two controls (language, theme) still work around it.
 */

const visibleHeader = (page: Page) => page.locator("header").filter({ visible: true });

// The button's accessible name is translated, so it changes with the language.
const LANGUAGE_BUTTON_NAME = /Select language|Seleccionar idioma/;

/** Language and theme live in the header, beside the way in (TRA-236). */
const languageButton = (page: Page) =>
  visibleHeader(page).getByRole("button", { name: LANGUAGE_BUTTON_NAME });

const askField = (page: Page) => page.getByRole("textbox", { name: /Where to\?|A dónde/ });

async function chooseLanguage(page: Page, name: RegExp) {
  await languageButton(page).click();
  await page.getByRole("menuitemradio", { name }).click();
}

test.describe("Landing page — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title is set correctly", async ({ page }) => {
    await expect(page).toHaveTitle(/Kyrian World/i);
  });

  test("the page is one question, one field and one action", async ({ page }) => {
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toHaveText("Where to?");

    await expect(askField(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan it" })).toBeDisabled();
  });

  test("the field takes an ask, and the ask needs an account", async ({ page }) => {
    const field = askField(page);
    await field.fill("Three days in Porto on a small budget");
    await expect(field).toHaveValue("Three days in Porto on a small budget");

    const planIt = page.getByRole("button", { name: "Plan it" });
    await expect(planIt).toBeEnabled();
    await planIt.click();

    // Signed out, the planner is behind the sign-in dialog, not a navigation.
    await expect(page.getByRole("dialog", { name: "Sign in to plan" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the header carries the wordmark and the way in, and no links besides", async ({
    page,
  }) => {
    const header = visibleHeader(page);
    await expect(header.getByRole("link", { name: /Kyrian World/i })).toBeVisible();
    await expect(header.getByRole("button", { name: /Sign in/i })).toBeVisible();
    await expect(header.getByRole("link")).toHaveCount(1);
  });

  test("language switcher shows English by default", async ({ page }) => {
    await expect(languageButton(page)).toHaveText(/en/i);
    await languageButton(page).click();
    await expect(page.getByRole("menuitemradio", { name: /English/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  test("switching language translates the question and the action", async ({ page }) => {
    await chooseLanguage(page, /Español/);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿A dónde vamos?");
    await expect(page.getByRole("button", { name: "Planear" })).toBeVisible();
    await expect(languageButton(page)).toHaveText(/es/i);

    await chooseLanguage(page, /English/);
    await expect(page.getByRole("button", { name: "Plan it" })).toBeVisible();
  });

  test("the theme toggle turns the slate to its light version and back", async ({ page }) => {
    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme", "dark");

    const toggle = visibleHeader(page).getByRole("button", {
      name: /Toggle theme|Cambiar tema/,
    });
    await toggle.click();
    await expect(root).toHaveAttribute("data-theme", "light");

    await toggle.click();
    await expect(root).toHaveAttribute("data-theme", "dark");
  });
});
