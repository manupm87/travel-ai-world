import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTypewriter } from "./useTypewriter";

const PHRASES = ["ab", "cd"] as const;
const TIMING = { typeMs: 10, deleteMs: 5, holdMs: 100, startDelayMs: 50 };

/** A two-letter phrase, from its first character to the next phrase's first. */
const CYCLE = TIMING.typeMs * 3 + TIMING.holdMs + TIMING.deleteMs * 3;
/** The opening pause runs before the first phrase, and again on every round. */
const FIRST = TIMING.startDelayMs + CYCLE - TIMING.typeMs;

function setMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  setMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Millisecond by millisecond: each tick schedules the next one from an effect,
 * so a single long jump would only ever fire the timer that already existed.
 */
function advance(total: number) {
  for (let elapsed = 0; elapsed < total; elapsed += 1) {
    act(() => void vi.advanceTimersByTime(1));
  }
}

describe("useTypewriter", () => {
  it("types the first phrase after the opening pause", () => {
    const { result } = renderHook(() => useTypewriter(PHRASES, TIMING));
    expect(result.current).toBe("");

    advance(TIMING.startDelayMs);
    expect(result.current).toBe("a");

    advance(TIMING.typeMs);
    expect(result.current).toBe("ab");
  });

  it("holds the phrase, rewinds it and moves on to the next one", () => {
    const { result } = renderHook(() => useTypewriter(PHRASES, TIMING));

    advance(TIMING.startDelayMs + TIMING.typeMs);
    expect(result.current).toBe("ab");

    advance(TIMING.holdMs - 1);
    expect(result.current).toBe("ab");

    advance(1 + TIMING.deleteMs * 3);
    expect(result.current).toBe("");

    advance(TIMING.typeMs * 2);
    expect(result.current).toBe("c");
  });

  it("comes back round to the first phrase", () => {
    const { result } = renderHook(() => useTypewriter(PHRASES, TIMING));

    advance(FIRST + CYCLE + TIMING.startDelayMs);
    expect(result.current).toBe("a");
  });

  it("shows the first phrase whole, and never moves, under reduced motion", () => {
    setMotion(true);
    const { result } = renderHook(() => useTypewriter(PHRASES, TIMING));

    advance(TIMING.startDelayMs * 2);
    expect(result.current).toBe("ab");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts over when the phrases change, and says nothing without any", () => {
    const { result, rerender } = renderHook(
      ({ phrases }: { phrases: readonly string[] }) => useTypewriter(phrases, TIMING),
      { initialProps: { phrases: PHRASES as readonly string[] } }
    );

    advance(TIMING.startDelayMs + TIMING.typeMs);
    expect(result.current).toBe("ab");

    rerender({ phrases: ["xy"] });
    expect(result.current).toBe("");
    advance(TIMING.startDelayMs);
    expect(result.current).toBe("x");

    rerender({ phrases: [] });
    expect(result.current).toBe("");
  });
});
