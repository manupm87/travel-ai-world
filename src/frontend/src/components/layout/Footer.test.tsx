import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import Footer from "./Footer";
import en from "@/i18n/en";

describe("Footer", () => {
  it("dates the copyright and credits the sources", () => {
    renderWithProviders(<Footer />);
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Kyrian World`)
    ).toBeInTheDocument();
    expect(screen.getByText(en.footer.sources)).toBeInTheDocument();
  });

  it("carries nothing to press: language and theme live in the header", () => {
    renderWithProviders(<Footer />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
