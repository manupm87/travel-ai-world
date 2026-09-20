import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { DemoBanner } from "./DemoBanner";

describe("DemoBanner", () => {
  it("carries both the full notice and the one-line version for a phone", () => {
    renderWithProviders(<DemoBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(en.plan.demo.title);

    const short = screen.getByText(en.plan.demo.short);
    expect(short.className).toContain("sm:hidden");

    const full = screen.getByText(en.plan.demo.body);
    expect(full.className).toContain("hidden");
    expect(full.className).toContain("sm:inline");
  });
});
