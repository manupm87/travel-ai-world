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
