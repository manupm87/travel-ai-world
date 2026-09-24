import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Kiri, KiriFace } from "./Kiri";
import { KIRI_FRAMES, type KiriState } from "./frames";

describe("Kiri", () => {
  it("draws every state at a whole-pixel scale", () => {
    for (const state of Object.keys(KIRI_FRAMES) as KiriState[]) {
      const { container, unmount } = render(<Kiri state={state} scale={3} />);
      const svg = container.querySelector(`svg[data-kiri="${state}"]`);
      expect(svg).not.toBeNull();
      const frame = KIRI_FRAMES[state];
      expect(svg?.getAttribute("width")).toBe(String(frame.width * 3));
      expect(svg?.getAttribute("height")).toBe(String(frame.height * 3));
      expect(svg?.querySelectorAll("path").length).toBe(frame.layers.length);
      unmount();
    }
  });

  it("is 16 x 18, and 16 x 26 with the handle out", () => {
    expect([KIRI_FRAMES.idle.width, KIRI_FRAMES.idle.height]).toEqual([16, 18]);
    expect([KIRI_FRAMES.dragging.width, KIRI_FRAMES.dragging.height]).toEqual([16, 26]);
  });

  it("rounds a fractional scale, since pixel art only reads at integers", () => {
    const { container } = render(<Kiri scale={2.4} />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("32");
  });

  it("is decoration unless it is given a name", () => {
    const { container, rerender } = render(<Kiri />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    rerender(<Kiri label="Kiri" />);
    expect(screen.getByRole("img", { name: "Kiri" })).toBeInTheDocument();
  });

  it("has a face of its own for the closed suitcase", () => {
    const { container } = render(<KiriFace scale={1} />);
    expect(container.querySelector('svg[data-kiri="face"]')).not.toBeNull();
  });
});
