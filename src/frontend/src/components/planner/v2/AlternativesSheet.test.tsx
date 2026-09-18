import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import type { OptionGroupState } from "@/hooks/plannerReducer";
import { BATHS, GROUP_IDS } from "@/test/fixtures/planner-budapest";
import { AlternativesSheet } from "./AlternativesSheet";

const a = en.plan.alternatives;

const group: OptionGroupState = {
  group_id: GROUP_IDS.baths,
  kind: "experience",
  prompt: "Thermal baths for day 2 · afternoon",
  slot: { day: 2, part: "afternoon" },
  selection: "single",
  cards: [BATHS.gellert, BATHS.rudas, BATHS.szechenyi],
  selectedIds: [],
  dismissedIds: [],
};

function renderSheet(overrides: Partial<ComponentProps<typeof AlternativesSheet>> = {}) {
  const props: ComponentProps<typeof AlternativesSheet> = {
    open: true,
    slot: { day: 2, part: "afternoon" },
    group,
    currentIds: [BATHS.gellert.id],
    shortlist: [BATHS.rudas.id],
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    onToggleShortlist: vi.fn(),
    onAskMore: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<AlternativesSheet {...props} />);
  return props;
}

describe("AlternativesSheet", () => {
  it("renders nothing when it is closed or has no slot", () => {
    const { container } = renderWithProviders(
      <AlternativesSheet
        open={false}
        slot={{ day: 2, part: "afternoon" }}
        group={group}
        currentIds={[]}
        shortlist={[]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
        onToggleShortlist={vi.fn()}
        onAskMore={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the slot, focuses the close button and marks the current card", () => {
    renderSheet();

    const dialog = screen.getByRole("dialog", {
      name: interpolate(a.slot, { day: 2, part: en.plan.parts.afternoon }),
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: a.close })).toHaveFocus();

    const current = within(dialog).getByRole("article", { name: BATHS.gellert.title });
    expect(within(current).getByText(a.current)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("article", { name: BATHS.rudas.title })
    ).toBeInTheDocument();
  });

  it("closes on Escape and on the close button", () => {
    const { onClose } = renderSheet();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: a.close }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers to ask the chat when the slot has no options yet", () => {
    const { onAskMore, onClose } = renderSheet({ group: null });

    expect(screen.getByText(a.none)).toBeInTheDocument();
    expect(screen.getByText(interpolate(a.shortlist, { count: 1 }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: a.askMore }));

    expect(onAskMore).toHaveBeenCalledWith({ day: 2, part: "afternoon" });
    expect(onClose).toHaveBeenCalled();
  });

  it("selects a card into the slot and closes", () => {
    const { onSelect, onClose } = renderSheet();

    const rudas = screen.getByRole("article", { name: BATHS.rudas.title });
    fireEvent.click(
      within(rudas).getByRole("button", {
        name: interpolate(en.plan.card.addToSlot, { day: 2, part: en.plan.parts.afternoon }),
      })
    );

    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.baths, [BATHS.rudas.id]);
    expect(onClose).toHaveBeenCalled();
  });
});
