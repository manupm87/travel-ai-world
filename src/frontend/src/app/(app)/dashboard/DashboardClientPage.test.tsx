import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor, within } from "@/test/render";
import { makeTripSummary } from "@/test/fixtures";
import { ApiError } from "@/services/http";
import { useTrips, type UseTripsResult } from "@/hooks/useTrips";
import en from "@/i18n/en";
import DashboardClientPage from "./DashboardClientPage";

vi.mock("@/hooks/useTrips", () => ({
  useTrips: vi.fn(),
}));

// The field has its own tests; here it only needs to be above the trips.
vi.mock("@/components/landing/AskField", () => ({
  AskField: () => <section aria-label="ask">ask</section>,
}));

const reload = vi.fn();
const remove = vi.fn<UseTripsResult["remove"]>();
const update = vi.fn<UseTripsResult["update"]>();

function trips(state: Partial<UseTripsResult>) {
  vi.mocked(useTrips).mockReturnValue({
    trips: [],
    status: "ready",
    error: null,
    reload,
    remove,
    update,
    ...state,
  });
}

const d = en.dashboard;
const paris = makeTripSummary({ id: "next", title: "Paris Escape", status: "planned" });

describe("DashboardClientPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    remove.mockResolvedValue(undefined);
    update.mockResolvedValue(undefined);
  });

  it("shows the field and skeletons while the trips load", () => {
    trips({ status: "loading" });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByRole("region", { name: "ask" })).toBeInTheDocument();
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
    expect(screen.getByRole("region", { name: "ask" })).toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: d.retry }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state when the account has no trips", () => {
    trips({ status: "ready", trips: [] });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByRole("heading", { name: d.emptyTitle })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "ask" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists the trips under Your trips, grouped", () => {
    trips({
      status: "ready",
      trips: [
        makeTripSummary({ id: "old", title: "Prague Winter", status: "finished" }),
        paris,
      ],
    });
    renderWithProviders(<DashboardClientPage />);

    expect(screen.getByRole("heading", { name: d.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: d.sections.planned })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paris Escape" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: d.emptyTitle })).not.toBeInTheDocument();
  });

  it("edits a trip from the card's menu and shows what the API stored", async () => {
    trips({ status: "ready", trips: [paris] });
    const { rerender } = renderWithProviders(<DashboardClientPage />);

    fireEvent.click(
      screen.getByRole("button", { name: d.card.menu.replace("{title}", paris.title) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: d.card.edit }));

    const dialog = screen.getByRole("dialog", { name: d.edit.title });
    fireEvent.change(within(dialog).getByLabelText(d.edit.name), {
      target: { value: "Paris, again" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: d.edit.save }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("next", { title: "Paris, again" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // `useTrips` replaces the card with what came back; the page renders it.
    trips({ status: "ready", trips: [{ ...paris, title: "Paris, again" }] });
    rerender(<DashboardClientPage />);
    expect(screen.getByRole("heading", { name: "Paris, again" })).toBeInTheDocument();
  });

  it("deletes a trip once the confirmation is answered", async () => {
    trips({ status: "ready", trips: [paris] });
    const { rerender } = renderWithProviders(<DashboardClientPage />);

    fireEvent.click(
      screen.getByRole("button", { name: d.card.menu.replace("{title}", paris.title) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: d.card.delete }));

    const dialog = screen.getByRole("dialog", { name: d.remove.title });
    fireEvent.click(within(dialog).getByRole("button", { name: d.remove.confirm }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith("next"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    trips({ status: "ready", trips: [] });
    rerender(<DashboardClientPage />);
    expect(screen.queryByRole("heading", { name: "Paris Escape" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: d.emptyTitle })).toBeInTheDocument();
  });

  it("keeps the card and says so when the delete is refused", async () => {
    remove.mockRejectedValue(new ApiError(500, "boom"));
    trips({ status: "ready", trips: [paris] });
    renderWithProviders(<DashboardClientPage />);

    fireEvent.click(
      screen.getByRole("button", { name: d.card.menu.replace("{title}", paris.title) })
    );
    fireEvent.click(screen.getByRole("menuitem", { name: d.card.delete }));
    fireEvent.click(screen.getByRole("button", { name: d.remove.confirm }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(d.remove.failed));
    expect(screen.getByRole("dialog", { name: d.remove.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Paris Escape" })).toBeInTheDocument();
  });
});
