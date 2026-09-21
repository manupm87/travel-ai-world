import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import en from "@/i18n/en";
import { makeTripSummary } from "@/test/fixtures";
import { useTrips, type UseTripsResult } from "@/hooks/useTrips";
import { plannerHref } from "@/components/landing/AskField";
import TripsHome from "./TripsHome";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useTrips", () => ({ useTrips: vi.fn() }));

const l = en.plan.trips;

function hook(over: Partial<UseTripsResult> = {}) {
  vi.mocked(useTrips).mockReturnValue({
    trips: [],
    status: "ready",
    error: null,
    reload: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    ...over,
  });
}

const upcoming = makeTripSummary({ id: "soon", title: "3 days in Budapest", phase: "upcoming" });
const past = makeTripSummary({ id: "then", title: "A weekend in Porto", phase: "past" });

const ASK = "Four days in Budapest, thermal baths & wine";
const field = () => screen.getByRole("textbox", { name: en.dashboard.headline });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
  hook();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TripsHome — the signed-in home", () => {
  it("asks first and lists the trips under it", () => {
    hook({ trips: [upcoming, past] });
    renderWithProviders(<TripsHome />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.dashboard.headline
    );
    expect(field()).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: l.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: upcoming.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: past.title })).toBeInTheDocument();
  });

  it("opens the planner with the ask; the reader is already signed in", async () => {
    renderWithProviders(<TripsHome />);

    fireEvent.change(field(), { target: { value: ASK } });
    fireEvent.click(screen.getByRole("button", { name: en.landing.send }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(plannerHref(ASK)));
    expect(push).toHaveBeenCalledWith("/plan/?q=Four%20days%20in%20Budapest%2C%20thermal%20baths%20%26%20wine");
  });

  it("offers an empty planner beside the heading, and a card opens its own trip", () => {
    hook({ trips: [upcoming] });
    renderWithProviders(<TripsHome />);

    expect(screen.getByRole("link", { name: l.newTrip })).toHaveAttribute("href", "/plan");
    // Next normalises the trailing slash away before a query string.
    expect(screen.getByRole("link", { name: upcoming.title })).toHaveAttribute(
      "href",
      "/plan?trip=soon"
    );
  });

  it("says so, quietly, when there is nothing saved yet", () => {
    hook({ trips: [] });
    renderWithProviders(<TripsHome />);

    expect(screen.getByText(l.emptyTitle)).toBeInTheDocument();
    // The field is still the first thing offered.
    expect(field()).toBeInTheDocument();
  });
});
