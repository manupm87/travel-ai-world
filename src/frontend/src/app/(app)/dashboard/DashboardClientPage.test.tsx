import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import { makeTripSummary } from "@/test/fixtures";
import { ApiError } from "@/services/http";
import { useTrips, type UseTripsResult } from "@/hooks/useTrips";
import en from "@/i18n/en";
import DashboardClientPage from "./DashboardClientPage";

vi.mock("@/hooks/useTrips", () => ({
  useTrips: vi.fn(),
}));

// The planner has its own tests; here it only needs to be present above the trips.
vi.mock("@/components/planner/PlannerCard", () => ({
  default: () => <section aria-label="planner">planner</section>,
}));

const reload = vi.fn();

function trips(state: Partial<UseTripsResult>) {
  vi.mocked(useTrips).mockReturnValue({
    trips: [],
    status: "ready",
    error: null,
    reload,
    ...state,
  });
}

const d = en.dashboard;

describe("DashboardClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the planner and a spinner while the trips load", () => {
    trips({ status: "loading" });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByRole("region", { name: "planner" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(d.loading);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: d.emptyTitle })).not.toBeInTheDocument();
  });

  it("shows the error state with a retry button that reloads", () => {
    trips({ status: "error", error: new ApiError(503, "Database down", "DB_UNAVAILABLE") });
    renderWithProviders(<DashboardClientPage />);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { name: d.errorTitle })).toBeInTheDocument();
    expect(within(alert).getByText(d.errorDescription)).toBeInTheDocument();
    // The server's text never reaches the screen.
    expect(screen.queryByText("Database down")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "planner" })).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: d.retry }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when the account has no trips", () => {
    trips({ status: "ready", trips: [] });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByRole("heading", { name: d.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "planner" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("groups the trips by status in the section order", () => {
    trips({
      status: "ready",
      trips: [
        makeTripSummary({ id: "old", title: "Prague Winter", status: "finished" }),
        makeTripSummary({ id: "draft", title: "Japan Draft", status: "planning" }),
        makeTripSummary({ id: "next", title: "Paris Escape", status: "planned" }),
      ],
    });
    renderWithProviders(<DashboardClientPage />);

    const labels = [d.sections.planned, d.sections.planning, d.sections.finished];
    const rendered = labels.map((label) => screen.getByText(label));
    // Upcoming first, then drafts, then history: document order follows SECTION_ORDER.
    expect(rendered[0]!.compareDocumentPosition(rendered[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(rendered[1]!.compareDocumentPosition(rendered[2]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    for (const title of ["Paris Escape", "Japan Draft", "Prague Winter"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.queryByRole("heading", { name: d.emptyTitle })).not.toBeInTheDocument();
  });

  it("hides the sections that have no trips", () => {
    trips({ status: "ready", trips: [makeTripSummary({ status: "planned" })] });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByText(d.sections.planned)).toBeInTheDocument();
    expect(screen.queryByText(d.sections.planning)).not.toBeInTheDocument();
    expect(screen.queryByText(d.sections.finished)).not.toBeInTheDocument();
  });
});
