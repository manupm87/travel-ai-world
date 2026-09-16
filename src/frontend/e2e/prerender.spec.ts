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
    expect(html).toMatch(/Your Dream Trip/i);
    expect(html).toMatch(/Hyper-Personalized AI/i);
  });
});

test.describe("Trip viewer — one static shell for every trip (/trip/?id=)", () => {
  test("the shell is served for any id; the trip itself is fetched by the browser", async ({
    request,
  }) => {
    const response = await request.get("/trip/?id=00000000-0000-0000-0000-000000000000");
    expect(response.status()).toBe(200);

    const html = await response.text();
    // The signed-in shell (header) is prerendered; no trip content can be, it is per user.
    expect(html).toContain("<header");
    expect(html).not.toMatch(/Japan Explorer/);
  });

  test("the old per-id folders are gone: /trip/<id>/ is a 404", async ({ request }) => {
    const response = await request.get("/trip/trip_japan_2026/");
    expect(response.status()).toBe(404);
  });
});
