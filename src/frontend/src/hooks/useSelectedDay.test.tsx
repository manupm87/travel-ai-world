import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { EMPTY_ITINERARY, applyItineraryOps, type ItineraryDraft } from "@/hooks/plannerReducer";
import { FIRST_ITINERARY_OPS } from "@/data/planner-demo/session";
import { useSelectedDay } from "./useSelectedDay";

const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

/** The same three-day trip without its last day, as a regeneration sends it. */
const shorter: ItineraryDraft = { ...itinerary, days: itinerary.days.slice(0, 2) };

describe("useSelectedDay", () => {
  it("starts on the trip overview", () => {
    const { result } = renderHook(() => useSelectedDay(itinerary));

    expect(result.current[0]).toBeNull();
  });

  it("keeps the day it is given while that day exists", () => {
    const { result, rerender } = renderHook(({ draft }) => useSelectedDay(draft), {
      initialProps: { draft: itinerary },
    });

    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);

    // A new days array holding the same day changes nothing.
    rerender({ draft: { ...itinerary, days: [...itinerary.days] } });
    expect(result.current[0]).toBe(2);
  });

  it("goes back to the overview — not to day 1 — when the selected day disappears", () => {
    const { result, rerender } = renderHook(({ draft }) => useSelectedDay(draft), {
      initialProps: { draft: itinerary },
    });

    act(() => result.current[1](3));
    expect(result.current[0]).toBe(3);

    rerender({ draft: shorter });

    expect(result.current[0]).toBeNull();
  });

  it("goes back to the overview when the itinerary is emptied and rebuilt", () => {
    const { result, rerender } = renderHook(({ draft }) => useSelectedDay(draft), {
      initialProps: { draft: itinerary },
    });

    act(() => result.current[1](2));

    // "Start over" empties the itinerary, then a new trip arrives.
    rerender({ draft: EMPTY_ITINERARY });
    expect(result.current[0]).toBeNull();

    rerender({ draft: itinerary });
    expect(result.current[0]).toBeNull();
  });
});
