import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import HeroSection from "./HeroSection";
import en from "@/i18n/en";

const h = en.hero;

describe("HeroSection", () => {
  it("renders badge, headline and subtitle", () => {
    renderWithProviders(<HeroSection />);
    expect(screen.getByText(h.badge)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(h.title.replace("\n", " "));
    expect(screen.getByText(h.subtitle)).toBeInTheDocument();
  });

  it("renders every trust marker", () => {
    renderWithProviders(<HeroSection />);
    for (const item of h.trust) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it("renders primary and secondary CTAs", () => {
    renderWithProviders(<HeroSection />);
    expect(screen.getByRole("link", { name: h.ctaPrimary })).toHaveAttribute("href", "#planner");
    expect(screen.getByRole("link", { name: h.ctaSecondary })).toHaveAttribute("href", "#how-it-works");
  });

  it("renders the hero image with its translated alt text", () => {
    renderWithProviders(<HeroSection />);
    const img = screen.getByAltText(h.imageAlt);
    expect(img).toHaveAttribute("src", expect.stringContaining("unsplash.com"));
  });
});
