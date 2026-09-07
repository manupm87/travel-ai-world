import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import FinalCTA from "./FinalCTA";
import en from "@/i18n/en";

const c = en.finalCta;

describe("FinalCTA", () => {
  it("renders headline and subtitle", () => {
    renderWithProviders(<FinalCTA />);
    expect(screen.getByRole("heading", { name: c.title })).toBeInTheDocument();
    expect(screen.getByText(c.subtitle)).toBeInTheDocument();
  });

  it("links the primary CTA to the planner and renders the secondary action", () => {
    renderWithProviders(<FinalCTA />);
    expect(screen.getByRole("link", { name: c.ctaPrimary })).toHaveAttribute("href", "#planner");
    expect(screen.getByRole("button", { name: c.ctaSecondary })).toBeInTheDocument();
  });
});
