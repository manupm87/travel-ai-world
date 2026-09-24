import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithProviders, screen } from "@/test/render";
import { KiriStage } from "./KiriStage";
import en from "@/i18n/en";

const kiri = () => document.querySelector("svg[data-kiri]:not(.hidden *)");
const phase = () => document.querySelector("[data-kiri-phase]")?.getAttribute("data-kiri-phase");

describe("KiriStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rolls in with the handle out, then waits and says she is ready", () => {
    renderWithProviders(<KiriStage listening={false} noting={false} leaving={false} />);
    act(() => vi.advanceTimersByTime(100));
    expect(phase()).toBe("arriving");
    expect(kiri()?.getAttribute("data-kiri")).toBe("dragging");

    act(() => vi.advanceTimersByTime(4000));
    expect(phase()).toBe("waiting");
    expect(screen.getByText(en.landing.kiri.ready)).toBeInTheDocument();
  });

  it("looks up at the field, and thinks while something is typed", () => {
    const { rerender } = renderWithProviders(
      <KiriStage listening={true} noting={false} leaving={false} />
    );
    act(() => vi.advanceTimersByTime(4100));
    expect(kiri()?.getAttribute("data-kiri")).toBe("look");
    expect(screen.getByText(en.landing.kiri.listening)).toBeInTheDocument();

    rerender(<KiriStage listening={true} noting={true} leaving={false} />);
    expect(kiri()?.getAttribute("data-kiri")).toBe("thinking");
    expect(screen.getByText(en.landing.kiri.noting)).toBeInTheDocument();
  });

  it("sets off when the ask is sent", () => {
    const { rerender } = renderWithProviders(
      <KiriStage listening={false} noting={false} leaving={false} />
    );
    act(() => vi.advanceTimersByTime(4100));
    rerender(<KiriStage listening={false} noting={false} leaving={true} />);
    act(() => vi.advanceTimersByTime(10));
    expect(screen.getByText(en.landing.kiri.off)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(500));
    expect(phase()).toBe("leaving");
  });

  it("replays the entrance, and keeps Kiri out of the accessibility tree", () => {
    renderWithProviders(<KiriStage listening={false} noting={false} leaving={false} />);
    act(() => vi.advanceTimersByTime(4100));
    fireEvent.click(screen.getByRole("button", { name: en.landing.replay }));
    act(() => vi.advanceTimersByTime(10));
    expect(phase()).toBe("out");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
