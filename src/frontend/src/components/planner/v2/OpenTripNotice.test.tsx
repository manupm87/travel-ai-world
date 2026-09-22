import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { OpenTripNotice } from "./OpenTripNotice";

const l = en.plan.trips;

describe("OpenTripNotice", () => {
  it("offers a new trip, as a button, beside the link home (TRA-223)", () => {
    const onNewTrip = vi.fn();
    renderWithProviders(<OpenTripNotice state={{ status: "not-found" }} onNewTrip={onNewTrip} />);

    expect(screen.getByRole("heading", { name: l.notFoundTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: l.title })).toHaveAttribute("href", expect.stringMatching(/^\/dashboard\/?$/));

    fireEvent.click(screen.getByRole("button", { name: l.newTrip }));

    expect(onNewTrip).toHaveBeenCalledTimes(1);
  });

  it("keeps the link alone without `onNewTrip`", () => {
    renderWithProviders(<OpenTripNotice state={{ status: "not-found" }} />);

    expect(screen.getByRole("link", { name: l.title })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("retries, and offers nothing else, when the trip failed to load", () => {
    const onRetry = vi.fn();
    renderWithProviders(
      <OpenTripNotice state={{ status: "error", onRetry }} onNewTrip={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: l.retry }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: l.newTrip })).toBeNull();
  });
});
