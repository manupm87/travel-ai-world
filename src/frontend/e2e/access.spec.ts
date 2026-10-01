import { test, expect, type Page, type Route } from "@playwright/test";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../src/services/session";
import { ACCESS_GRANT_PAGE, ADMIN_USAGE, ADMIN_USER_PAGE } from "../src/test/fixtures/admin";

/**
 * The access list (TRA-257, ADR 0026). Like `admin.spec.ts`, every API route
 * is mocked with `page.route` and the session is a fake unsigned JWT in
 * `localStorage` (the runner's real `E2E_TOKEN` when it has one), so it needs
 * no backend and never writes to one.
 *
 * The daily token quota (TRA-258) is here too: "Usage today" on the access
 * page, and the planner's message when ai_api answers a turn with 429.
 */

type Role = "admin" | "user";
type Grant = (typeof ACCESS_GRANT_PAGE.items)[number] | Record<string, unknown>;

const ACCESS_PATH = "/api/v1/users/me/access";
const path = (pathname: string) => (url: URL) => url.pathname === pathname;
const prefix = (start: string) => (url: URL) =>
  url.pathname.startsWith(start) && url.pathname.length > start.length;

function fakeToken(sub: string, email: string): string {
  const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub, email, exp })}.`;
}

async function signIn(page: Page, role: Role, { allowed }: { allowed: boolean }) {
  const me = { ...ADMIN_USER_PAGE.items[role === "admin" ? 0 : 1]!, role };
  await page.addInitScript(
    ({ keys, session }) => {
      window.localStorage.setItem(keys.user, JSON.stringify(session.user));
      window.localStorage.setItem(keys.token, session.token);
    },
    {
      keys: { token: TOKEN_STORAGE_KEY, user: USER_STORAGE_KEY },
      session: {
        token: process.env.E2E_TOKEN ?? fakeToken(me.subject ?? "sub", me.email),
        user: { id: me.id, email: me.email, name: me.name, role },
      },
    }
  );
  await page.route(path("/api/v1/users/me"), (route) => route.fulfill({ json: me }));
  await page.route(path(ACCESS_PATH), (route) =>
    route.fulfill({ json: { allowed, daily_token_limit: 300000 } })
  );
  return me;
}

/** An in-memory access list behind `/api/v1/admin/access`: GET lists, PUT upserts, DELETE removes. */
async function mockAccessList(page: Page) {
  const grants = new Map<string, Grant>(ACCESS_GRANT_PAGE.items.map((grant) => [grant.email, grant]));
  const writes: { method: string; email: string; body: unknown }[] = [];

  // "Usage today" (TRA-258): ai_api's counters, joined to the accounts in the browser.
  await page.route(path("/api/v1/ai/admin/usage"), (route) => route.fulfill({ json: ADMIN_USAGE }));
  await page.route(path("/api/v1/admin/users"), (route) => route.fulfill({ json: ADMIN_USER_PAGE }));

  await page.route(path("/api/v1/admin/access"), (route) =>
    route.fulfill({
      json: {
        items: [...grants.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, grant]) => grant),
        next_cursor: null,
      },
    })
  );
  await page.route(prefix("/api/v1/admin/access/"), (route: Route) => {
    const request = route.request();
    const email = decodeURIComponent(new URL(request.url()).pathname.split("/").pop()!);
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { daily_token_limit: number | null; note: string | null };
      writes.push({ method: "PUT", email, body });
      const grant = {
        email,
        ...body,
        added_by: "admin-sub",
        created_at: "2026-10-01T12:00:00Z",
        updated_at: "2026-10-01T12:00:00Z",
      };
      grants.set(email, grant);
      return route.fulfill({ json: grant });
    }
    if (request.method() === "DELETE") {
      writes.push({ method: "DELETE", email, body: null });
      return grants.delete(email)
        ? route.fulfill({ status: 204 })
        : route.fulfill({ status: 404, json: { detail: { message: "x", error_code: "NOT_FOUND" } } });
    }
    return route.fallback();
  });
  return writes;
}

test.describe("Access list — an account that is not invited", () => {
  test("lands on the no-access page instead of its trips, and can sign out", async ({ page }, testInfo) => {
    const me = await signIn(page, "user", { allowed: false });
    // What an uninvited account's other calls get from core_api.
    await page.route(prefix("/api/v1/trips"), (route) =>
      route.fulfill({
        status: 403,
        json: { detail: { message: "This account has not been given access yet", error_code: "ACCESS_DENIED" } },
      })
    );

    // The app asks about access only when it is built with a core_api URL
    // (`NEXT_PUBLIC_API_URL`). The Compose stack is (`playwright.stack.config.ts`
    // says so in its metadata), so there the question must be asked and this
    // test must run: that is CI's `e2e-stack` job. The plain static export
    // (`just test-e2e-static`, CI's `frontend` job) has no backend to ask and
    // leaves the answer unknown, so there is nothing to see there.
    const asked = page.waitForRequest((request) => new URL(request.url()).pathname === ACCESS_PATH, {
      timeout: 5_000,
    });
    await page.goto("/dashboard/");
    if (testInfo.config.metadata.apiConfigured) {
      await asked;
    } else {
      test.skip(
        (await asked.catch(() => null)) === null,
        "This build has no core_api URL (the static export keeps the demo mode), so the app never asks " +
          "/users/me/access. The flow is covered by CI's e2e-stack job (just test-e2e-stack, this same test) " +
          "and by Vitest: src/components/auth/AccessFlow.test.tsx (AuthProvider + ProtectedRoute + NoAccess)."
      );
    }

    const card = page.getByTestId("no-access");
    await expect(card).toBeVisible();
    await expect(card.getByRole("heading", { level: 1 })).toHaveText("You're not on the list yet");
    await expect(card.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(card.getByRole("button", { name: "Check again" })).toBeVisible();
    await expect(card).toContainText(me.email);

    await card.getByRole("button", { name: "Sign out" }).click();
    // Home, with or without the route guard's `?redirect=` (it races the sign-out's own push).
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await expect(page.getByTestId("no-access")).toHaveCount(0);
  });
});

test.describe("Access list — as an administrator", () => {
  test("adds an email with a limit, then removes it", async ({ page }) => {
    await signIn(page, "admin", { allowed: true });
    const writes = await mockAccessList(page);

    await page.goto("/admin/access/");

    const nav = page.getByRole("navigation", { name: "Admin console" });
    await expect(nav.getByRole("link", { name: "Access", exact: true })).toHaveAttribute("aria-current", "page");
    const list = page.getByRole("table", { name: "Invited emails" });
    await expect(list.locator("tbody tr")).toHaveCount(3);
    await expect(list).toContainText("Unlimited");
    await expect(list).toContainText("Default");

    await page.getByLabel("Email", { exact: true }).fill("New.Person@Example.com");
    await page.getByLabel("Daily token limit").fill("1200");
    await page.getByLabel("Note", { exact: true }).fill("beta tester");
    await page.getByRole("button", { name: "Add or update" }).click();

    await expect(page.getByTestId("access-message")).toHaveText("new.person@example.com was invited.");
    await expect(list.locator("tbody tr")).toHaveCount(4);
    const row = list.locator("tbody tr", { hasText: "new.person@example.com" });
    await expect(row).toContainText("1,200");
    await expect(row).toContainText("beta tester");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");

    await page.getByRole("button", { name: "Remove new.person@example.com" }).click();
    const dialog = page.getByRole("dialog", { name: "Remove this email?" });
    await expect(dialog).toContainText("new.person@example.com");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Remove access" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("access-message")).toHaveText("new.person@example.com is off the list.");
    // The removed row cannot take the focus back: the form does.
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
    await expect(list.locator("tbody tr")).toHaveCount(3);
    await expect(list).not.toContainText("new.person@example.com");

    expect(writes).toEqual([
      {
        method: "PUT",
        email: "new.person@example.com",
        body: { daily_token_limit: 1200, note: "beta tester" },
      },
      { method: "DELETE", email: "new.person@example.com", body: null },
    ]);
  });

  test("shows what each account spent today against its limit", async ({ page }) => {
    await signIn(page, "admin", { allowed: true });
    await mockAccessList(page);

    await page.goto("/admin/access/");

    await expect(page.getByRole("heading", { level: 2, name: "Usage today" })).toBeVisible();
    const usage = page.getByRole("table", { name: "Token usage today" });
    await expect(usage.locator("tbody tr")).toHaveCount(3);
    // Ada spent 52,500 of her 50,000; Grace is unlimited; the third subject has no account.
    const ada = usage.locator("tbody tr", { hasText: "ada@example.com" });
    await expect(ada).toContainText("52,500");
    await expect(ada).toContainText("50,000");
    await expect(ada).toContainText("Limit reached");
    await expect(usage.locator("tbody tr", { hasText: "grace@example.com" })).toContainText("Unlimited");
    await expect(usage.locator("tbody tr", { hasText: "ffffffff" })).toContainText("Default");
    await expect(page.getByRole("button", { name: "Reload" })).toBeEnabled();
  });

  test("a bad email never reaches the API", async ({ page }) => {
    await signIn(page, "admin", { allowed: true });
    const writes = await mockAccessList(page);

    await page.goto("/admin/access/");
    await expect(page.getByRole("table", { name: "Invited emails" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("not-an-email");
    await page.getByRole("button", { name: "Add or update" }).click();

    await expect(page.getByTestId("access-message")).toHaveText("Enter a valid email address.");
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(writes).toEqual([]);
  });
});

test.describe("Daily token quota — a planner turn over the limit", () => {
  test("says today's allowance is spent and when it resets, with nothing to retry", async ({ page }, testInfo) => {
    // The planner asks ai_api only when the app is built with an API URL. The
    // plain static export (`just test-e2e-static`) answers every turn from the
    // recorded demo and never sends one, so there is nothing to refuse there:
    // this runs on the Compose stack (CI's `e2e-stack`, `just test-e2e-stack`).
    test.skip(
      !testInfo.config.metadata.apiConfigured,
      "This build has no ai_api URL (the static export plans from the recorded demo), so no turn is ever " +
        "sent. Covered by CI's e2e-stack job (this same test) and by Vitest: " +
        "src/app/(app)/plan/PlannerClientPage.test.tsx and src/services/planner.test.ts."
    );
    await signIn(page, "user", { allowed: true });
    const resetsAt = new Date(Date.UTC(2030, 0, 2)).toISOString();
    await page.route(path("/api/v1/ai/planner/cities"), (route) => route.fulfill({ json: [] }));
    await page.route(path("/api/v1/ai/planner"), (route) =>
      route.fulfill({
        status: 429,
        json: {
          detail: {
            message: "Daily token limit reached",
            error_code: "DAILY_TOKEN_LIMIT",
            extras: { limit: 300000, used: 300412, resets_at: resetsAt },
          },
        },
      })
    );

    await page.goto("/plan/");
    await page.getByPlaceholder("Ask for a change or search for something…").fill("Four days in Budapest");
    await page.getByRole("button", { name: "Send" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "today's planning limit" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/You've reached today's planning limit\. You can keep planning from \w+,? \d{1,2}:\d{2}/);
    await expect(alert.getByRole("button", { name: "Retry" })).toHaveCount(0);
    // The recorded demo must not answer in ai_api's place.
    await expect(page.getByRole("status").filter({ hasText: "Demo mode" })).toHaveCount(0);
  });
});
