import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import Footer from "./Footer";
import en from "@/i18n/en";

describe("Footer", () => {
  it("links the wordmark home and dates the copyright", () => {
    renderWithProviders(<Footer />);
    expect(screen.getByRole("link", { name: /Kyrian World/ })).toHaveAttribute("href", "/");
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Kyrian World`)
    ).toBeInTheDocument();
  });

  it("carries the reader's own controls: language and theme", () => {
    renderWithProviders(<Footer />);
    expect(
      screen.getByRole("group", { name: en.nav.selectLanguage })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: en.theme.toggle })
    ).toBeInTheDocument();
  });
});
