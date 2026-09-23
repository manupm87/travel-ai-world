import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ADMIN_USER_PAGE } from "@/test/fixtures/admin";
import BUDAPEST from "@/test/fixtures/trip-budapest";
import { TripHeader } from "./TripHeader";

const ADA = ADMIN_USER_PAGE.items[0]!;
const TRIP = { ...BUDAPEST, planner_session_id: "sess-1" };

describe("TripHeader", () => {
  it("names the owner as name · email and shows the city with its country", () => {
    renderWithProviders(<TripHeader trip={TRIP} owner={ADA} />);
    expect(screen.getByRole("heading", { level: 1, name: TRIP.title })).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace · ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("Budapest, Hungary")).toBeInTheDocument();
  });

  it("falls back to the owner's id in mono when the account is unknown", () => {
    renderWithProviders(<TripHeader trip={TRIP} owner={undefined} />);
    const id = screen.getByText(TRIP.user_id);
    expect(id).toHaveClass("font-mono");
  });

  it("shows the phase as a pill with its tone", () => {
    renderWithProviders(<TripHeader trip={{ ...TRIP, phase: "past" }} owner={ADA} />);
    const pill = screen.getByText("Over").closest("[data-tone]");
    expect(pill).toHaveAttribute("data-tone", "muted");
  });

  it("prints both ids in mono with a copy button each", () => {
    renderWithProviders(<TripHeader trip={TRIP} owner={ADA} />);
    expect(screen.getByText(TRIP.id)).toHaveClass("font-mono");
    expect(screen.getByText("sess-1")).toHaveClass("font-mono");
    expect(screen.getByRole("button", { name: "Copy the trip id" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy the session id" })).toBeInTheDocument();
  });

  it("offers nothing to change the trip", () => {
    renderWithProviders(<TripHeader trip={{ ...TRIP, planner_session_id: null }} owner={ADA} />);
    // Only the trip id's copy button: no session, no rename, no delete, no planner link.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
