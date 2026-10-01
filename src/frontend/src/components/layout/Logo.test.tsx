import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { Logo, Mark } from "./Logo";

function parts(container: HTMLElement) {
  return [...container.querySelectorAll("[data-part]")].map((el) =>
    el.getAttribute("data-part")
  );
}

describe("Logo", () => {
  it("links home under the brand name", () => {
    renderWithProviders(<Logo />);
    const link = screen.getByRole("link", { name: "Kyrian World" });
    expect(link).toHaveAttribute("href", "/");
  });
});

describe("Mark", () => {
  it("draws the pin alone at the default size, hidden from assistive tech", () => {
    const { container } = renderWithProviders(<Mark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "28");
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(parts(container)).toEqual(["pin"]);
  });

  it("draws the world under the pin at 56, without horizon or islands", () => {
    const { container } = renderWithProviders(<Mark size={56} />);
    expect(parts(container)).toEqual(["ocean", "continent", "pin"]);
  });

  it("draws the islands and the horizon at 96", () => {
    const { container } = renderWithProviders(<Mark size={96} />);
    expect(parts(container)).toEqual([
      "ocean",
      "continent",
      "island",
      "island",
      "horizon",
      "pin",
    ]);
  });

  it("keeps the clip ids apart when the mark appears twice", () => {
    const { container } = renderWithProviders(
      <>
        <Mark size={56} />
        <Mark size={56} />
      </>
    );
    const ids = [...container.querySelectorAll("clipPath")].map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
  });
});
