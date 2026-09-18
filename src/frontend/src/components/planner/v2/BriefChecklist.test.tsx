import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { BRIEF_AFTER_FIRST_MESSAGE, BRIEF_COMPLETE } from "@/test/fixtures/planner-budapest";
import { BriefChecklist } from "./BriefChecklist";

const c = en.plan.checklist;

describe("BriefChecklist", () => {
  it("shows what the brief has, what it still misses, and keeps Generate disabled", () => {
    renderWithProviders(
      <BriefChecklist
        brief={BRIEF_AFTER_FIRST_MESSAGE}
        missing={["dates"]}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByText(c.title)).toBeInTheDocument();
    expect(screen.getByText(interpolate(c.progress, { done: 4, total: 5 }))).toBeInTheDocument();
    expect(screen.getByText("Budapest")).toBeInTheDocument();
    expect(screen.getByText("Madrid")).toBeInTheDocument();
    expect(screen.getByText(interpolate(c.adults, { adults: 2 }))).toBeInTheDocument();
    // Only the missing field falls back to the chat.
    expect(screen.getAllByText(c.pending)).toHaveLength(1);
    expect(screen.getByRole("button", { name: c.generate })).toBeDisabled();
  });

  it("enables Generate once nothing is missing", () => {
    const onGenerate = vi.fn();
    renderWithProviders(
      <BriefChecklist brief={BRIEF_COMPLETE} missing={[]} onGenerate={onGenerate} />
    );

    expect(screen.getByText(interpolate(c.progress, { done: 5, total: 5 }))).toBeInTheDocument();
    expect(screen.queryByText(c.pending)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(interpolate(c.nights, { nights: 4 })))).toBeInTheDocument();

    const button = screen.getByRole("button", { name: c.generate });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("waits while a turn is streaming", () => {
    renderWithProviders(
      <BriefChecklist brief={BRIEF_COMPLETE} missing={[]} disabled onGenerate={vi.fn()} />
    );

    expect(screen.getByRole("button", { name: c.generate })).toBeDisabled();
  });
});
