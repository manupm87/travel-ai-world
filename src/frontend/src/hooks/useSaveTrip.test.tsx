import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { UnauthorizedError } from "@/services/http";
import { readSavedTripId, writeSavedTripId } from "@/services/plannerDraft";
import { clearSession } from "@/services/session";
import { saveDraftAsTrip } from "@/services/trips";
import {
  ACTIVITIES,
  BRIEF_COMPLETE,
  HOTELS,
} from "@/data/planner-demo/session";
import { makeTrip } from "@/test/fixtures";
import { BUDAPEST } from "@/test/fixtures/planner-city";
import {
  applyItineraryOps,
  EMPTY_ITINERARY,
  initialPlannerState,
  type PlannerState,
} from "./plannerReducer";
import { useSaveTrip } from "./useSaveTrip";

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

/** The one thing the hook needs from `http.ts` besides the error type. */
let apiAvailable = true;
vi.mock("@/services/http", async () => {
  const actual = await vi.importActual<typeof import("@/services/http")>("@/services/http");
  return { ...actual, isApiAvailable: () => apiAvailable };
});

vi.mock("@/services/plannerDraft", () => ({
  readSavedTripId: vi.fn(() => null),
  writeSavedTripId: vi.fn(),
}));

vi.mock("@/services/session", () => ({ clearSession: vi.fn() }));

vi.mock("@/services/trips", () => ({ saveDraftAsTrip: vi.fn() }));

const saveDraftAsTripMock = vi.mocked(saveDraftAsTrip);
const p = en.plan.panel;

const wrapper = ({ children }: { children: ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

const itinerary = applyItineraryOps(EMPTY_ITINERARY, [
  { op: "set_stay", card: HOTELS.rum },
  { op: "put_activity", slot: { day: 1, part: "morning" }, card: ACTIVITIES.greatMarket },
]);

function planned(over: Partial<PlannerState> = {}): PlannerState {
  return { ...initialPlannerState(), brief: BRIEF_COMPLETE, missing: [], itinerary, ...over };
}

/** The hook always needs the destination it is saving; the tests vary the rest. */
const options = (over: Parameters<typeof useSaveTrip>[1] = {}) => ({ city: BUDAPEST, ...over });

const auth = (isAuthenticated: boolean) =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated,
    isLoading: false,
    user: null,
    provider: "google" as const,
    login: vi.fn(),
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
    isAdmin: false,
    logout: vi.fn(),
  });

describe("useSaveTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSavedTripId).mockReturnValue(null);
    apiAvailable = true;
    auth(true);
  });

  it("writes the draft with the trip's title in the reader's language", async () => {
    saveDraftAsTripMock.mockResolvedValue(makeTrip({ id: "t1" }));
    const state = planned();

    const { result } = renderHook(() => useSaveTrip(state, options()), { wrapper });
    expect(result.current).toMatchObject({ status: "idle", canSave: true, tripId: null });

    act(() => result.current.save());

    expect(result.current.status).toBe("saving");
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.tripId).toBe("t1");
    expect(writeSavedTripId).toHaveBeenCalledWith("t1");

    const [draft, brief, city, saveOptions] = saveDraftAsTripMock.mock.calls[0]!;
    expect(draft).toBe(state.itinerary);
    expect(brief).toBe(state.brief);
    expect(city).toBe(BUDAPEST);
    expect(saveOptions).toMatchObject({
      title: interpolate(p.heading, { count: 3, destination: "Budapest" }),
      tripId: null,
    });
  });

  it("updates the trip this tab already saved instead of creating a second one", async () => {
    vi.mocked(readSavedTripId).mockReturnValue("t1");
    saveDraftAsTripMock.mockResolvedValue(makeTrip({ id: "t1" }));

    const { result } = renderHook(() => useSaveTrip(planned(), options()), { wrapper });
    await waitFor(() => expect(result.current.tripId).toBe("t1"));

    act(() => result.current.save());
    await waitFor(() => expect(result.current.status).toBe("saved"));

    expect(saveDraftAsTripMock.mock.calls[0]![3]).toMatchObject({ tripId: "t1" });
  });

  it("ends in error and lets the visitor try again", async () => {
    saveDraftAsTripMock.mockRejectedValueOnce(new Error("network"));
    saveDraftAsTripMock.mockResolvedValueOnce(makeTrip({ id: "t1" }));

    const { result } = renderHook(() => useSaveTrip(planned(), options()), { wrapper });

    act(() => result.current.save());
    await waitFor(() => expect(result.current.status).toBe("error"));

    act(() => result.current.save());
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("clears the session on a rejected token and says nothing else", async () => {
    saveDraftAsTripMock.mockRejectedValue(new UnauthorizedError("expired"));

    const { result } = renderHook(() => useSaveTrip(planned(), options()), { wrapper });

    act(() => result.current.save());
    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(result.current.status).toBe("saving");
  });

  it("cannot save a recorded session, a signed-out visitor or a static build", () => {
    const demo = renderHook(() => useSaveTrip(planned(), options({ enabled: false })), { wrapper });
    expect(demo.result.current.canSave).toBe(false);
    act(() => demo.result.current.save());
    expect(saveDraftAsTripMock).not.toHaveBeenCalled();

    auth(false);
    expect(renderHook(() => useSaveTrip(planned(), options()), { wrapper }).result.current.canSave).toBe(false);

    auth(true);
    apiAvailable = false;
    expect(renderHook(() => useSaveTrip(planned(), options()), { wrapper }).result.current.canSave).toBe(false);
  });

  it("has nothing to save until the destination is a city the planner covers", () => {
    const { result } = renderHook(() => useSaveTrip(planned(), { city: null }), { wrapper });

    expect(result.current.canSave).toBe(false);
    act(() => result.current.save());
    expect(saveDraftAsTripMock).not.toHaveBeenCalled();
  });

  it("saves into the trip the planner has open, and keeps Saved when Save opened it", async () => {
    saveDraftAsTripMock.mockResolvedValue(makeTrip({ id: "t9" }));
    const { result, rerender } = renderHook(
      (openTripId: string | null) => useSaveTrip(planned(), options({ openTripId })),
      { wrapper, initialProps: null as string | null }
    );

    act(() => result.current.save());
    await waitFor(() => expect(result.current.status).toBe("saved"));

    // The page puts the new id in the URL; the hook must not take that for a
    // different trip and forget it just saved.
    rerender("t9");
    expect(result.current.status).toBe("saved");
    expect(result.current.tripId).toBe("t9");

    // Another trip opened: a new target, and nothing saved to it yet.
    rerender("t8");
    expect(result.current).toMatchObject({ status: "idle", tripId: "t8" });
  });

  it("has nothing to save until there is an itinerary", () => {
    const { result } = renderHook(() => useSaveTrip(initialPlannerState(), options()), { wrapper });

    expect(result.current.canSave).toBe(false);
  });

  it("goes back to idle once the itinerary moves on from what was saved", async () => {
    saveDraftAsTripMock.mockResolvedValue(makeTrip({ id: "t1" }));
    const { result, rerender } = renderHook((state: PlannerState) => useSaveTrip(state, options()), {
      wrapper,
      initialProps: planned(),
    });

    act(() => result.current.save());
    await waitFor(() => expect(result.current.status).toBe("saved"));

    rerender(
      planned({
        itinerary: applyItineraryOps(itinerary, [
          { op: "put_activity", slot: { day: 2, part: "morning" }, card: ACTIVITIES.greatMarket },
        ]),
      })
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.tripId).toBe("t1");
  });
});
