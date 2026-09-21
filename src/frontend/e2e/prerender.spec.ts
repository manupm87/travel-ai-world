import { test, expect } from "@playwright/test";

test.describe("Static export — HTML as served, before any JS runs", () => {
  test("landing page arrives prerendered, not as a shell filled in on hydration", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const html = await response.text();

    expect(html).toContain("<header");
    expect(html).toContain("<footer");
    // The question and the field itself, in the HTML as served: the landing
    // reads its `?redirect=` from `window`, never through `useSearchParams`,
    // which would leave this page a shell filled in on hydration.
    expect(html).toMatch(/Where to\?/);
    expect(html).toContain("<textarea");
  });
});

test.describe("The signed-in home — /dashboard/", () => {
  test("the shell is served; the trips are the browser's to fetch", async ({ request }) => {
    const response = await request.get("/dashboard/");
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The shell prerenders; what is behind the guard does not, because the
    // session lives in the browser and the trips are per account.
    expect(html).toContain("<header");
    expect(html).not.toMatch(/3 days in Budapest/);
  });
});

test.describe("The planner — one static shell for every trip (/plan/?trip=)", () => {
  test("the shell is served for any id; the trip itself is fetched by the browser", async ({
    request,
  }) => {
    const response = await request.get("/plan/?trip=00000000-0000-0000-0000-000000000000");
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The signed-in shell (header) is prerendered; no trip content can be, it is per user.
    expect(html).toContain("<header");
    expect(html).not.toMatch(/3 days in Budapest/);
  });

  test("the old viewer's shell is still served, and still says nothing about a trip", async ({
    request,
  }) => {
    const response = await request.get("/trip/?id=00000000-0000-0000-0000-000000000000");
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toMatch(/3 days in Budapest/);
  });

  test("the old per-id folders are gone: /trip/<id>/ is a 404", async ({ request }) => {
    const response = await request.get("/trip/trip_japan_2026/");
    expect(response.status()).toBe(404);
  });
});
