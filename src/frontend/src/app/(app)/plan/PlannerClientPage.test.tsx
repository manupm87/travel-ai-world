import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import en from "@/i18n/en";
import { useAuth } from "@/context/AuthContext";
import { initialPlannerState, toPlannerDraft } from "@/hooks/plannerReducer";
import { useTrip, type UseTripResult } from "@/hooks/useTrip";
import { streamPlannerTurn } from "@/services/planner";
import {
  PLANNER_DRAFT_KEY,
  readPlannerDraft,
  readSavedTripId,
  writePlannerDraft,
  writeSavedTripId,
} from "@/services/plannerDraft";
import type { PlannerEvent } from "@/types/planner";
import PlannerClientPage from "./PlannerClientPage";

/**
 * The page's own rules about the tab's draft (TRA-223): a bare `/plan/` is a
 * new trip, and a missing `?trip=` that is the tab's saved one drops its
 * draft. `usePlanner`, `useSaveTrip` and `services/plannerDraft.ts` are the
 * real ones over jsdom's `sessionStorage`; the router, the trip load, the
 * cities and the stream are stand-ins.
 */

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/plan/",
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () => search,
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: vi.fn() }));

vi.mock("@/hooks/useTrip", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useTrip")>("@/hooks/useTrip");
  return { ...actual, useTrip: vi.fn() };
});

vi.mock("@/hooks/usePlannerCities", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePlannerCities")>(
    "@/hooks/usePlannerCities"
  );
  return {
    ...actual,
    usePlannerCities: () => ({ cities: [], status: "ready" }),
  };
});

vi.mock("@/services/planner", () => ({ streamPlannerTurn: vi.fn() }));

vi.mock("@/components/planner/v2/TripMap", () => ({ TripMap: () => null }));

const SAVED_ID = "0deb4701-42c5-4f3c-b2c6-28b9cfd66cd5";
const OTHER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OLD_MESSAGE = "Three days in Budapest, the old trip";

function trip(over: Partial<UseTripResult> = {}) {
  vi.mocked(useTrip).mockReturnValue({
    trip: null,
    status: "loading",
    error: null,
    reload: vi.fn(),
    ...over,
  });
}

/** The tab as the last session left it: a conversation, maybe saved as a trip. */
function storeDraft(savedAs: string | null) {
  writePlannerDraft(
    toPlannerDraft({
      ...initialPlannerState(),
      messages: [{ id: "m1", kind: "text", role: "user", content: OLD_MESSAGE }],
    })
  );
  if (savedAs) writeSavedTripId(savedAs);
}

function open(query: string) {
  search = new URLSearchParams(query);
  return renderWithProviders(<PlannerClientPage />);
}

async function* done(): AsyncGenerator<PlannerEvent, void, unknown> {
  yield { type: "done" } as PlannerEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    user: null,
    provider: "google" as const,
    login: vi.fn(),
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
    isAdmin: false,
    logout: vi.fn(),
  });
  vi.mocked(streamPlannerTurn).mockImplementation(done);
  trip();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const tripRedirects = () =>
  replace.mock.calls.filter(([href]) => String(href).includes("?trip="));

describe("PlannerClientPage — /plan/ without ?trip= (TRA-223)", () => {
  it("starts empty when the tab's draft was saved as a trip, and stays on /plan/", async () => {
    storeDraft(SAVED_ID);

    open("");

    expect(screen.queryByText(OLD_MESSAGE)).toBeNull();
    expect(screen.getByRole("heading", { name: en.plan.panel.emptyTitle })).toBeInTheDocument();
    expect(readSavedTripId()).toBeNull();
    expect(sessionStorage.getItem(PLANNER_DRAFT_KEY)).toBeNull();
    // Nothing sends the visitor back to the trip they left.
    await waitFor(() => expect(useTrip).toHaveBeenLastCalledWith(null));
    expect(tripRedirects()).toEqual([]);
  });

  it("still sends `?q=` as the first turn of the new trip", async () => {
    storeDraft(SAVED_ID);

    open("q=Four%20days%20in%20Rome");

    await waitFor(() => expect(streamPlannerTurn).toHaveBeenCalledTimes(1));
    const [turn] = vi.mocked(streamPlannerTurn).mock.calls[0]!;
    expect(turn.message).toBe("Four days in Rome");
    expect(turn.history ?? []).toHaveLength(0);
    expect(screen.queryByText(OLD_MESSAGE)).toBeNull();
    expect(tripRedirects()).toEqual([]);
  });

  it("restores a draft that was never saved", () => {
    storeDraft(null);

    open("");

    expect(screen.getByText(OLD_MESSAGE)).toBeInTheDocument();
    expect(readPlannerDraft()?.messages).toHaveLength(1);
    expect(tripRedirects()).toEqual([]);
  });
});

describe("PlannerClientPage — a ?trip= that is not found (TRA-223)", () => {
  it("drops the tab's draft when it is the tab's own saved trip", async () => {
    storeDraft(SAVED_ID);
    trip({ status: "not-found" });

    open(`trip=${SAVED_ID}`);

    await waitFor(() => expect(readSavedTripId()).toBeNull());
    expect(sessionStorage.getItem(PLANNER_DRAFT_KEY)).toBeNull();
    expect(screen.queryByText(OLD_MESSAGE)).toBeNull();
    expect(screen.getByRole("button", { name: en.plan.trips.newTrip })).toBeInTheDocument();
  });

  it("leaves the tab's draft alone when it is some other id", () => {
    storeDraft(SAVED_ID);
    trip({ status: "not-found" });

    open(`trip=${OTHER_ID}`);

    expect(readSavedTripId()).toBe(SAVED_ID);
    expect(readPlannerDraft()?.messages).toHaveLength(1);
  });

  it("goes to an empty /plan/ from the pane's New trip", async () => {
    trip({ status: "not-found" });

    open(`trip=${OTHER_ID}`);
    screen.getByRole("button", { name: en.plan.trips.newTrip }).click();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/plan/"));
  });
});
