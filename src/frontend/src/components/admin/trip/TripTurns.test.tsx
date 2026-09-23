import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import { ADMIN_USER_PAGE, ADA_SUBJECT, turnSummary } from "@/test/fixtures/admin";
import type { AdminUser } from "@/services/admin";
import { TripTurns } from "./TripTurns";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const bySubject = new Map<string, AdminUser>([[ADA_SUBJECT, ADMIN_USER_PAGE.items[0]!]]);

const TURNS = [
  turnSummary({ turn_id: "01J8TURN0000000000000000A1", session_id: "sess-1" }),
  turnSummary({
    turn_id: "01J8TURN0000000000000000A2",
    ts: "2026-09-23T09:20:00Z",
    session_id: "sess-1",
    action: "save",
  }),
];

describe("TripTurns", () => {
  it("lists the session's turns, oldest first, each linking to the inspector", () => {
    renderWithProviders(
      <TripTurns
        sessionId="sess-1"
        state={{ status: "ready", turns: TURNS, truncated: false }}
        bySubject={bySubject}
      />
    );
    expect(screen.getByRole("heading", { name: "Turns that made this trip" })).toBeInTheDocument();
    expect(screen.getByText("2 turns")).toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "Turns of this trip's planner session, oldest first",
    });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link")).toHaveAttribute(
      "href",
      expect.stringMatching(/\/admin\/turn\/?\?id=01J8TURN0000000000000000A1$/)
    );
    expect(within(rows[1]!).getByRole("link")).toHaveAttribute(
      "href",
      expect.stringMatching(/\/admin\/turn\/?\?id=01J8TURN0000000000000000A2$/)
    );
    expect(table).toHaveTextContent("Ada Lovelace");
  });

  it("says the trip predates sessions when it has none", () => {
    renderWithProviders(<TripTurns sessionId={null} state={{ status: "idle" }} bySubject={bySubject} />);
    expect(
      screen.getByText("This trip was saved before sessions were recorded.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says the session has no turns when it is empty", () => {
    renderWithProviders(
      <TripTurns
        sessionId="sess-1"
        state={{ status: "ready", turns: [], truncated: false }}
        bySubject={bySubject}
      />
    );
    expect(
      screen.getByText("No turns were recorded for this trip's planner session.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("says when the list stops at the cap", () => {
    renderWithProviders(
      <TripTurns
        sessionId="sess-1"
        state={{ status: "ready", turns: TURNS, truncated: true }}
        bySubject={bySubject}
      />
    );
    expect(screen.getByText("Showing the first 200 turns.")).toBeInTheDocument();
  });
});
