import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { makeTripSummary } from "@/test/fixtures";
import en from "@/i18n/en";
import { ConfirmDelete } from "./ConfirmDelete";

const r = en.dashboard.remove;
const trip = makeTripSummary({ id: "t1", title: "Paris Escape" });

const onConfirm = vi.fn<() => Promise<void>>();
const onCancel = vi.fn();

const open = () =>
  renderWithProviders(
    <ConfirmDelete trip={trip} onConfirm={onConfirm} onCancel={onCancel} />
  );

describe("ConfirmDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onConfirm.mockResolvedValue(undefined);
  });

  it("shows nothing when no trip is about to go", () => {
    renderWithProviders(
      <ConfirmDelete trip={null} onConfirm={onConfirm} onCancel={onCancel} />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the trip and keeps Cancel under the finger", () => {
    open();

    const dialog = screen.getByRole("dialog", { name: r.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(
      screen.getByText(r.description.replace("{title}", trip.title))
    ).toBeInTheDocument();
    // Enter must not delete anything by momentum.
    expect(screen.getByRole("button", { name: r.cancel })).toHaveFocus();
  });

  it("deletes on the destructive button", async () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: r.confirm }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("says what happened when the API refuses, and lets the reader try again", async () => {
    onConfirm.mockRejectedValue(new Error("nope"));
    open();

    fireEvent.click(screen.getByRole("button", { name: r.confirm }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(r.failed));
    expect(screen.getByRole("button", { name: r.confirm })).toBeEnabled();
  });

  it("cancels on the button and on Escape", () => {
    open();

    fireEvent.click(screen.getByRole("button", { name: r.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("gives the focus back to whatever opened it", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { rerender } = open();
    expect(screen.getByRole("button", { name: r.cancel })).toHaveFocus();

    rerender(<ConfirmDelete trip={null} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
