import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import Footer from "./Footer";
import en from "@/i18n/en";

const f = en.footer;

describe("Footer", () => {
  it("renders branding and tagline", () => {
    renderWithProviders(<Footer />);
    expect(screen.getByRole("link", { name: /Travel AI World/ })).toHaveAttribute("href", "/");
    expect(screen.getByText(f.tagline)).toBeInTheDocument();
  });

  it("renders the link groups in dictionary order with their items", () => {
    renderWithProviders(<Footer />);
    const headings = screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(f.links.map((group) => group.title));
    for (const group of f.links) {
      for (const item of group.items) {
        expect(screen.getByRole("link", { name: item })).toBeInTheDocument();
      }
    }
  });

  it("renders social links and copyright from the dictionary", () => {
    renderWithProviders(<Footer />);
    for (const name of f.social) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(f.copyright)).toBeInTheDocument();
  });
});
