import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { ApiError } from "@/services/http";
import { makeTripSummary } from "@/test/fixtures";
import { useTrips, type UseTripsResult } from "@/hooks/useTrips";
import { TripsList } from "./TripsList";

vi.mock("@/hooks/useTrips", () => ({ useTrips: vi.fn() }));

const l = en.plan.trips;

const remove = vi.fn();
const rename = vi.fn();
const reload = vi.fn();

function hook(over: Partial<UseTripsResult> = {}) {
  vi.mocked(useTrips).mockReturnValue({
    trips: [],
    status: "ready",
    error: null,
    reload,
    remove,
    rename,
    ...over,
  });
}

const ongoing = makeTripSummary({ id: "now", title: "Two days in Bologna", phase: "ongoing" });
const upcoming = makeTripSummary({ id: "soon", title: "3 days in Budapest", phase: "upcoming" });
const past = makeTripSummary({ id: "then", title: "A weekend in Porto", phase: "past" });

describe("TripsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue(undefined);
    rename.mockResolvedValue(undefined);
  });

  it("groups the trips by phase, in the order they matter in", () => {
    hook({ trips: [past, upcoming, ongoing] });
    renderWithProviders(<TripsList />);

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([l.groups.ongoing, l.groups.upcoming, l.groups.past]);
  });

  it("says which trips are happening now and which are over, and links every card to the planner", () => {
    hook({ trips: [ongoing, upcoming, past] });
    renderWithProviders(<TripsList />);

    expect(screen.getByText(l.phase.ongoing)).toBeInTheDocument();
    expect(screen.getByText(l.phase.past)).toBeInTheDocument();
    expect(screen.queryByText(l.phase.upcoming)).not.toBeInTheDocument();
    // Next normalises the trailing slash away before a query string; the
    // router puts it back on navigation (`trailingSlash: true`).
    expect(screen.getByRole("link", { name: upcoming.title })).toHaveAttribute(
      "href",
      "/plan?trip=soon"
    );
  });

  it("offers renaming only where core_api would accept it", () => {
    hook({ trips: [upcoming, past] });
    renderWithProviders(<TripsList />);

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: past.title }) })
    );
    const pastMenu = screen.getByRole("menu", {
      name: interpolate(l.card.menu, { title: past.title }),
    });
    expect(within(pastMenu).queryByRole("menuitem", { name: l.card.rename })).toBeNull();
    expect(within(pastMenu).getByRole("menuitem", { name: l.card.delete })).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: upcoming.title }) })
    );
    const upcomingMenu = screen.getByRole("menu", {
      name: interpolate(l.card.menu, { title: upcoming.title }),
    });
    expect(
      within(upcomingMenu).getByRole("menuitem", { name: l.card.rename })
    ).toBeInTheDocument();
  });

  it("renames a trip through the dialog", async () => {
    hook({ trips: [upcoming] });
    renderWithProviders(<TripsList />);

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: upcoming.title }) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: l.card.rename }));

    const field = screen.getByLabelText(l.rename.label);
    fireEvent.change(field, { target: { value: "  Budapest in autumn  " } });
    fireEvent.click(screen.getByRole("button", { name: l.rename.save }));

    await waitFor(() => expect(rename).toHaveBeenCalledWith("soon", "Budapest in autumn"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses an empty title without asking the API", () => {
    hook({ trips: [upcoming] });
    renderWithProviders(<TripsList />);

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: upcoming.title }) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: l.card.rename }));
    fireEvent.change(screen.getByLabelText(l.rename.label), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: l.rename.save }));

    expect(screen.getByRole("alert")).toHaveTextContent(l.rename.required);
    expect(rename).not.toHaveBeenCalled();
  });

  it("says so in the still-open dialog when core_api refuses the rename", async () => {
    hook({ trips: [upcoming] });
    rename.mockRejectedValue(new ApiError(409, "locked", "TRIP_LOCKED"));
    renderWithProviders(<TripsList />);

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: upcoming.title }) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: l.card.rename }));
    fireEvent.change(screen.getByLabelText(l.rename.label), { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: l.rename.save }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(l.rename.failed));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("folds the card away before the trip leaves the list", async () => {
    vi.useFakeTimers();
    hook({ trips: [past] });
    renderWithProviders(<TripsList />);

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(l.card.menu, { title: past.title }) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: l.card.delete }));
    fireEvent.click(screen.getByRole("button", { name: l.remove.confirm }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(remove).toHaveBeenCalledWith("then");
    vi.useRealTimers();
  });

  it("invites the first trip when there is none", () => {
    hook({ trips: [] });
    renderWithProviders(<TripsList />);

    expect(screen.getByText(l.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(l.emptyDescription)).toBeInTheDocument();
  });

  it("stands in for the cards while they load", () => {
    hook({ status: "loading" });
    renderWithProviders(<TripsList />);

    expect(screen.getByRole("status")).toHaveTextContent(l.loading);
  });

  it("says what went wrong and offers another go", () => {
    hook({ status: "error", error: new ApiError(500, "boom") });
    renderWithProviders(<TripsList />);

    expect(screen.getByRole("alert")).toHaveTextContent(l.errorTitle);
    fireEvent.click(screen.getByRole("button", { name: l.retry }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
