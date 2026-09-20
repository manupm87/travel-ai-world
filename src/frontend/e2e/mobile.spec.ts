import { test, expect, type Page } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";

/**
 * The phone viewport (TRA-187). One 390 × 844 pass over the two pages that can
 * break there: the landing, which must never scroll sideways and must offer its
 * CTA and its drawer, and the planner, whose whole promise is that the page
 * itself does not scroll — the panes do.
 *
 * It runs in all three configs (`test:e2e`, `test:e2e:static`, `test:e2e:stack`)
 * and needs no backend: the planner is signed in with a fake unsigned JWT, as
 * `trips.spec.ts` and `planner.spec.ts` sign in with a real one, and no turn is
 * ever sent — two of the three configs have nothing to answer it.
 */

const VIEWPORT = { width: 390, height: 844 };

test.use({ viewport: VIEWPORT, isMobile: true, hasTouch: true });

/**
 * A session the route guard accepts: `services/session.ts` reads the expiry out
 * of the payload and never verifies the signature, so an unsigned token is
 * enough to render `/plan/` without a `core_api` to mint a real one.
 */
function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

function signIn(page: Page) {
  const email = "mobile@example.com";
  const token = fakeToken("mobile-e2e", email);
  return page.addInitScript(
    ({ keys, session }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: { token, user: { id: "mobile-e2e", email, name: "Mobile" } },
    }
  );
}

/** What the document measures: no horizontal overflow, and the page's own height. */
function documentBox(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
}

test.describe("Landing page on a phone — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("nothing overflows sideways", async ({ page }) => {
    const box = await documentBox(page);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.innerWidth);
  });

  test("the field fills the width, inside a 16 px gutter", async ({ page }) => {
    const box = await page.getByRole("textbox", { name: "Where to?" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(16);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(VIEWPORT.width - 16);
    // Not a token field in the middle of the screen: it takes the page.
    expect(box?.width).toBeGreaterThan(VIEWPORT.width * 0.7);
  });

  test("the header offers the CTA and the menu, and the menu covers the screen", async ({
    page,
  }) => {
    const header = page.locator("header").filter({ visible: true });
    await expect(header.getByRole("button", { name: /Sign in/i })).toBeVisible();

    const menuButton = header.getByRole("button", { name: "Open menu" });
    await expect(menuButton).toBeVisible();
    await menuButton.click();

    const drawer = page.getByRole("dialog", { name: /Menu|Menú/ });
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    // A device pixel ratio of 3 makes these land a rounding error short of the
    // viewport, so the assertion is "covers it", not "is exactly it".
    expect(drawerBox?.width).toBeGreaterThan(VIEWPORT.width - 1);
    expect(drawerBox?.height).toBeGreaterThan(VIEWPORT.height - 1);
  });
});

test.describe("Planner on a phone — /plan/", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.goto("/plan/");
  });

  test("the page does not scroll: the panes do", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();

    const box = await documentBox(page);
    expect(box.scrollWidth).toBe(box.innerWidth);
    expect(box.scrollHeight).toBe(box.innerHeight);
  });

  test("the tabs and the whole composer are inside the viewport", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Trip" })).toBeVisible();

    const composer = page.getByRole("textbox", { name: "Tell the AI where you want to go" });
    await expect(composer).toBeVisible();
    const composerBox = await composer.boundingBox();
    expect(composerBox).not.toBeNull();
    // Nothing of it is under the fold — the bug this suite exists for.
    expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0)).toBeLessThanOrEqual(
      VIEWPORT.height
    );
  });

  test("the Trip tab replaces the chat pane instead of stacking under it", async ({ page }) => {
    const composer = page.getByRole("textbox", { name: "Tell the AI where you want to go" });
    await expect(composer).toBeVisible();

    await page.getByRole("tab", { name: "Trip" }).click();
    await expect(composer).toBeHidden();
  });
});
