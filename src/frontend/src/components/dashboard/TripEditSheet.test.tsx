import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { makeTripSummary } from "@/test/fixtures";
import type { TripUpdate } from "@/services/trips";
import en from "@/i18n/en";
import { TripEditSheet } from "./TripEditSheet";

const e = en.dashboard.edit;

const trip = makeTripSummary({
  id: "t1",
  title: "Paris Escape",
  description: "Three days of art.",
  startDate: "2026-05-15",
  endDate: "2026-05-18",
  status: "planned",
});

const onSave = vi.fn<(patch: TripUpdate) => Promise<void>>();
const onClose = vi.fn();

function open() {
  return renderWithProviders(
    <TripEditSheet trip={trip} onSave={onSave} onClose={onClose} />
  );
}

const field = (name: string) => screen.getByLabelText(name);

describe("TripEditSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSave.mockResolvedValue(undefined);
  });

  it("shows nothing when no trip is being edited", () => {
    renderWithProviders(<TripEditSheet trip={null} onSave={onSave} onClose={onClose} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a modal dialog filled with the trip", () => {
    open();

    const dialog = screen.getByRole("dialog", { name: e.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(field(e.name)).toHaveValue("Paris Escape");
    expect(field(e.description)).toHaveValue("Three days of art.");
    expect(field(e.startDate)).toHaveValue("2026-05-15");
    expect(field(e.endDate)).toHaveValue("2026-05-18");
    expect(field(e.status)).toHaveValue("planned");
    // The title takes the focus: it is the field people came to change.
    expect(field(e.name)).toHaveFocus();
  });

  it("sends only the fields that changed", async () => {
    open();

    fireEvent.change(field(e.name), { target: { value: "Paris, again" } });
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: "Paris, again" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves duration_days with the dates", async () => {
    open();

    fireEvent.change(field(e.endDate), { target: { value: "2026-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ end_date: "2026-05-20", duration_days: 6 })
    );
  });

  it("closes without a request when nothing was touched", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: e.save }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty title and says why", () => {
    open();

    fireEvent.change(field(e.name), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    expect(screen.getByRole("alert")).toHaveTextContent(e.nameRequired);
    expect(field(e.name)).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("refuses an end date before the start", () => {
    open();

    fireEvent.change(field(e.endDate), { target: { value: "2026-05-01" } });
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    expect(screen.getByRole("alert")).toHaveTextContent(e.datesOrder);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("stays open and says so when the API refuses", async () => {
    onSave.mockRejectedValue(new Error("nope"));
    open();

    fireEvent.change(field(e.name), { target: { value: "Paris, again" } });
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(e.failed));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Escape, on Cancel and on the close button", () => {
    const { rerender } = open();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: e.cancel }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: e.close }));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<TripEditSheet trip={null} onSave={onSave} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives the focus back to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { rerender } = renderWithProviders(
      <TripEditSheet trip={trip} onSave={onSave} onClose={onClose} />
    );
    expect(field(e.name)).toHaveFocus();

    rerender(<TripEditSheet trip={null} onSave={onSave} onClose={onClose} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
