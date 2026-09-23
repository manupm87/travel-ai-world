import { describe, expect, it, vi } from "vitest";
import type { TurnDetail } from "@/services/admin";
import { CHAT_TURN, INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import { renderWithProviders, screen, within } from "@/test/render";
import { turnMarks } from "./marks";
import { travellerSummary } from "./traveller";
import { TravellerView } from "./TravellerView";

function renderTurn(turn: TurnDetail, onMark = vi.fn()) {
  const traveller = travellerSummary(turn.context);
  renderWithProviders(
    <TravellerView traveller={traveller} marks={turnMarks(turn, traveller)} onMark={onMark} />
  );
  return onMark;
}

describe("TravellerView", () => {
  it("a choice shows the chosen group, not a bubble", () => {
    renderTurn(INSPECTOR_TURN);
    expect(screen.getByText("Chosen: hotels:erzsebetvaros")).toBeInTheDocument();
    expect(screen.queryByText("Is Széchenyi open on Mondays?")).not.toBeInTheDocument();
  });

  it("a message shows the ask as the traveller's bubble and no choice", () => {
    renderTurn(CHAT_TURN);
    expect(screen.getByText("Is Széchenyi open on Mondays?")).toBeInTheDocument();
    expect(screen.queryByText(/^Chosen:/)).not.toBeInTheDocument();
    expect(screen.getByText("Yes, every day from 7:00.")).toBeInTheDocument();
  });

  it("renders the answer as Markdown", () => {
    renderTurn(INSPECTOR_TURN);
    expect(screen.getByText("Day 2 is full").tagName).toBe("STRONG");
  });

  it("one row per day with its places, the stay and the route", () => {
    renderTurn(INSPECTOR_TURN);
    const container = document.body;
    const days = container.querySelectorAll("[data-day]");
    expect(days).toHaveLength(4);
    const day2 = within(container.querySelector('[data-day="2"]') as HTMLElement);
    expect(day2.getByText(": Baths in Városliget")).toBeInTheDocument();
    expect(day2.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Hotel Moments Budapest")).toBeInTheDocument();
    expect(screen.getByText("Madrid to Budapest")).toBeInTheDocument();
  });

  it("every warning is a pill with its code and message", () => {
    renderTurn(INSPECTOR_TURN);
    const warning = screen.getByRole("status");
    expect(warning).toHaveAttribute("data-warning", "overloaded_day");
    expect(warning).toHaveTextContent("overloaded_day: Day 2 is very full for a balanced pace.");
  });

  it("the four marks are buttons that say where they lead", () => {
    const onMark = renderTurn(INSPECTOR_TURN);
    for (const name of [
      "Go to the SSE events",
      "Go to the model output",
      "Go to the step that warned",
      "Go to the city-kb search",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    screen.getByRole("button", { name: "Go to the SSE events" }).click();
    expect(onMark).toHaveBeenCalledWith(expect.objectContaining({ n: 1, target: "turn-events" }));
  });

  it("the chat turn has only the answer's mark", () => {
    renderTurn(CHAT_TURN);
    expect(screen.getAllByRole("button", { name: /^Go to/ })).toHaveLength(1);
  });
});
