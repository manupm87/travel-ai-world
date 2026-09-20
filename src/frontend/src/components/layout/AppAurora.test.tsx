import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppAurora } from "./AppAurora";

const pathname = vi.hoisted(() => ({ value: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
}));

describe("AppAurora", () => {
  it("paints the dusk horizon behind the reading pages", () => {
    pathname.value = "/dashboard";
    const { container } = render(<AppAurora />);

    const layer = container.querySelector("[aria-hidden='true']");
    expect(layer).toBeInTheDocument();
    // It must never take part in the layout, or the page shifts under it.
    expect(layer?.className).toContain("pointer-events-none");
    expect(layer?.className).toContain("fixed");
  });

  it("stands aside on the planner, which paints its own panes", () => {
    pathname.value = "/plan/";
    const { container } = render(<AppAurora />);

    expect(container).toBeEmptyDOMElement();
  });
});
