import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { EMPTY_BRIEF, type BriefField, type TripBrief } from "@/types/planner";
import { QuickReplies } from "./QuickReplies";

const q = en.plan.quickReplies;

/** The budget control only shows while `budget_tier` is null; pin it otherwise. */
const brief = (overrides: Partial<TripBrief> = {}): TripBrief => ({
  ...EMPTY_BRIEF,
  budget_tier: 2,
  ...overrides,
});

function renderQuickReplies(missing: BriefField[], overrides: Partial<TripBrief> = {}) {
  const onAnswer = vi.fn();
  const result = renderWithProviders(
    <QuickReplies brief={brief(overrides)} missing={missing} onAnswer={onAnswer} />
  );
  return { ...result, onAnswer };
}

const confirmButton = () => screen.getByRole("button", { name: q.confirm });

describe("QuickReplies", () => {
  it("renders nothing once the brief is complete", () => {
    const { container } = renderQuickReplies([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("waits for both dates before it lets the answer through", () => {
    renderQuickReplies(["dates", "travellers"]);

    expect(confirmButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(q.from), { target: { value: "2026-10-23" } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(q.to), { target: { value: "2026-10-27" } });
    expect(confirmButton()).toBeEnabled();
  });

  it("answers with the patch and the sentence the assistant reads", () => {
    const { onAnswer } = renderQuickReplies(["dates", "travellers"]);

    fireEvent.change(screen.getByLabelText(q.from), { target: { value: "2026-10-23" } });
    fireEvent.change(screen.getByLabelText(q.to), { target: { value: "2026-10-27" } });
    fireEvent.click(confirmButton());

    expect(onAnswer).toHaveBeenCalledTimes(1);
    const [patch, text] = onAnswer.mock.calls[0]!;
    expect(patch).toEqual({
      start_date: "2026-10-23",
      end_date: "2026-10-27",
      nights: 4,
      adults: 2,
      children: 0,
    });
    expect(text).toContain("Dates: 2026-10-23 to 2026-10-27");
  });

  it("asks for the budget while the brief has no tier", () => {
    renderQuickReplies([], { budget_tier: null });

    const tiers = screen.getAllByRole("radio");
    expect(tiers).toHaveLength(3);
    expect(tiers[1]).toHaveAccessibleName(
      `${en.plan.priceTiers["2"]} ${en.plan.priceTierNames["2"]}`
    );
    // Budget is optional, but with nothing else to answer there is no turn to
    // send until a tier is picked.
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(tiers[1]!);
    expect(confirmButton()).toBeEnabled();
  });

  it("hints the destination with a covered city, or the built-in copy without one", () => {
    const { unmount } = renderWithProviders(
      <QuickReplies
        brief={brief()}
        missing={["destination"]}
        destinationPlaceholder="Bologna"
        onAnswer={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Bologna")).toBeInTheDocument();
    unmount();

    renderQuickReplies(["destination"]);
    expect(screen.getByPlaceholderText(q.destinationPlaceholder)).toBeInTheDocument();
  });
});
