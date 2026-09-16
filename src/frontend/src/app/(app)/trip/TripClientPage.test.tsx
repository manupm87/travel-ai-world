import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import japan from "@/test/fixtures/trip-japan";
import { ApiError } from "@/services/http";
import { toTrip } from "@/services/trips";
import { useTrip, type UseTripResult } from "@/hooks/useTrip";
import en from "@/i18n/en";
import TripClientPage from "./TripClientPage";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@/hooks/useTrip", () => ({
  useTrip: vi.fn(),
}));

const reload = vi.fn();

function tripState(state: Partial<UseTripResult>) {
  vi.mocked(useTrip).mockReturnValue({
    trip: null,
    status: "loading",
    error: null,
    reload,
    ...state,
  });
}

const tv = en.tripViewer;
const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("TripClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = `id=${ID}`;
  });

  it("hands the id from the query string to the hook (null when absent)", () => {
    tripState({ status: "loading" });
    renderWithProviders(<TripClientPage />);
    expect(useTrip).toHaveBeenLastCalledWith(ID);

    search = "";
    renderWithProviders(<TripClientPage />);
    expect(useTrip).toHaveBeenLastCalledWith(null);
  });

  it("shows a spinner while the trip loads", () => {
    tripState({ status: "loading" });
    renderWithProviders(<TripClientPage />);

    expect(screen.getByRole("status")).toHaveTextContent(tv.loading);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the not-found state with a link back to the dashboard", () => {
    tripState({ status: "not-found" });
    renderWithProviders(<TripClientPage />);

    expect(screen.getByRole("heading", { name: tv.notFoundTitle })).toBeInTheDocument();
    expect(screen.getByText(tv.notFoundDescription)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: tv.backToDashboard })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error state with a retry button that reloads", () => {
    tripState({ status: "error", error: new ApiError(503, "Database down", "DB_UNAVAILABLE") });
    renderWithProviders(<TripClientPage />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: tv.errorTitle })).toBeInTheDocument();
    expect(within(alert).getByText(tv.errorDescription)).toBeInTheDocument();
    // The server's text never reaches the screen.
    expect(screen.queryByText("Database down")).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: tv.retry }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("renders the whole viewer for a loaded trip", () => {
    const trip = toTrip(japan);
    tripState({ status: "ready", trip });
    renderWithProviders(<TripClientPage />);

    expect(screen.getByRole("heading", { name: trip.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: tv.routeOverview })).toBeInTheDocument();
    expect(screen.getByText(tv.tripOverview)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: tv.accommodations })).toBeInTheDocument();
    expect(screen.getByText(tv.aiInsights)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your 14-Day Journey" })).toBeInTheDocument();
    for (const day of trip.itinerary) {
      expect(screen.getByText(day.title)).toBeInTheDocument();
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
