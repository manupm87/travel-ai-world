import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import type { OptionGroupState } from "@/hooks/plannerReducer";
import { BATHS, GROUP_IDS } from "@/data/planner-demo/session";
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
    onAskAlternatives: vi.fn(),
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
        onAskAlternatives={vi.fn()}
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

  it("asks for the next page when the slot has no options yet, staying open", () => {
    const { onAskAlternatives, onClose } = renderSheet({ group: null });

    expect(screen.getByText(a.none)).toBeInTheDocument();
    expect(screen.getByText(interpolate(a.shortlist, { count: 1 }))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: a.more }));

    expect(onAskAlternatives).toHaveBeenCalledWith({ day: 2, part: "afternoon" }, { more: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows that the options are on their way while the turn streams", () => {
    renderSheet({ group: null, loading: true });

    expect(screen.getByRole("status")).toHaveTextContent(a.loading);
    expect(screen.queryByText(a.none)).not.toBeInTheDocument();
  });

  it("keeps the cards on screen while the next page streams below them", () => {
    renderSheet({ loading: true });

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("article", { name: BATHS.rudas.title })).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent(a.loading);
    expect(screen.queryByText(a.none)).not.toBeInTheDocument();
  });

  it("searches for what the traveller types instead, and empties the box", () => {
    const { onAskAlternatives } = renderSheet();

    const box = screen.getByRole("textbox", { name: a.guidePlaceholder });
    fireEvent.change(box, { target: { value: "  thermal bath  " } });
    fireEvent.click(screen.getByRole("button", { name: a.guideSubmit }));

    expect(onAskAlternatives).toHaveBeenCalledWith(
      { day: 2, part: "afternoon" },
      { guidance: "thermal bath" }
    );
    expect(box).toHaveValue("");
  });

  it("ignores an empty search and keeps its button out of reach", () => {
    const { onAskAlternatives } = renderSheet();

    const submit = screen.getByRole("button", { name: a.guideSubmit });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: a.guidePlaceholder }), {
      target: { value: "   " },
    });
    fireEvent.submit(submit.closest("form")!);

    expect(onAskAlternatives).not.toHaveBeenCalled();
  });

  it("puts the box right after the close button in the focus order", () => {
    renderSheet();

    const focusable = Array.from(
      screen.getByRole("dialog").querySelectorAll<HTMLElement>("input, button")
    );
    expect(focusable[0]).toHaveAccessibleName(a.close);
    expect(focusable[1]).toBe(screen.getByRole("textbox", { name: a.guidePlaceholder }));
  });

  it("leaves the stay's sheet as it was: no box, only the footer", () => {
    renderSheet({ slot: { day: 0, part: null }, group: null });

    expect(screen.queryByRole("textbox", { name: a.guidePlaceholder })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: a.more })).toBeInTheDocument();
  });

  it("selects a card into the slot and closes", () => {
    const { onSelect, onClose } = renderSheet();

    const rudas = screen.getByRole("article", { name: BATHS.rudas.title });
    fireEvent.click(
      within(rudas).getByRole("button", {
        name: interpolate(en.plan.card.addToSlot, { day: 2, part: en.plan.parts.afternoon }),
      })
    );

    // The sheet always knows the slot and sends it with the pick (TRA-185).
    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.baths, [BATHS.rudas.id], {
      day: 2,
      part: "afternoon",
    });
    expect(onClose).toHaveBeenCalled();
  });
});
