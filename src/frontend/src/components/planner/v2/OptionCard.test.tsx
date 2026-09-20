import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { applyItineraryOps, EMPTY_ITINERARY, type ItineraryDraft } from "@/hooks/plannerReducer";
import type { Slot } from "@/types/planner";
import { BATHS, FIRST_ITINERARY_OPS } from "@/data/planner-demo/session";
import { OptionCard } from "./OptionCard";

const p = en.plan;
const sp = p.slotPicker;
const CARD = BATHS.rudas;
const ITINERARY = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

function renderCard(
  props: { slot?: Slot | null; pickSlot?: ItineraryDraft | null } = {}
) {
  const onChoose = vi.fn();
  const result = renderWithProviders(
    <OptionCard
      card={CARD}
      slot={props.slot ?? null}
      pickSlot={props.pickSlot ?? null}
      onChoose={onChoose}
    />
  );
  return { ...result, onChoose };
}

const primary = (name: string) => screen.getByRole("button", { name });
const picker = () => screen.queryByRole("group", { name: sp.title });

describe("OptionCard", () => {
  it("adds straight into the slot the group names", () => {
    const { onChoose } = renderCard({ slot: { day: 2, part: "afternoon" } });

    const label = interpolate(p.card.addToSlot, { day: 2, part: p.parts.afternoon });
    fireEvent.click(primary(label));

    expect(onChoose).toHaveBeenCalledWith();
    expect(picker()).not.toBeInTheDocument();
  });

  it('reads "Choose" and adds at once when there is no itinerary to place it in', () => {
    const { onChoose } = renderCard();

    fireEvent.click(primary(p.card.choose));

    expect(onChoose).toHaveBeenCalledWith();
  });

  it("falls back to Choose when the itinerary has no day yet", () => {
    renderCard({ pickSlot: EMPTY_ITINERARY });

    expect(primary(p.card.choose)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.card.addToTrip })).not.toBeInTheDocument();
  });

  it("opens the picker for an unplaced card and reports the slot chosen", () => {
    const { onChoose } = renderCard({ pickSlot: ITINERARY });

    const button = primary(p.card.addToTrip);
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    const open = screen.getByRole("group", { name: sp.title });
    fireEvent.click(
      within(within(open).getByRole("group", { name: sp.day })).getByRole("button", {
        name: interpolate(p.panel.day, { day: 2 }),
      })
    );
    fireEvent.click(
      within(within(open).getByRole("group", { name: sp.part })).getByRole("button", {
        name: p.parts.afternoon,
      })
    );
    fireEvent.click(within(open).getByRole("button", { name: sp.confirm }));

    expect(onChoose).toHaveBeenCalledWith({ day: 2, part: "afternoon" });
    expect(picker()).not.toBeInTheDocument();
  });

  it("cancels the picker without choosing and gives the focus back to the button", () => {
    const { onChoose } = renderCard({ pickSlot: ITINERARY });

    const button = primary(p.card.addToTrip);
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: sp.cancel }));

    expect(onChoose).not.toHaveBeenCalled();
    expect(picker()).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
  });

  it("closes the picker again when the button is pressed twice", () => {
    renderCard({ pickSlot: ITINERARY });

    const button = primary(p.card.addToTrip);
    fireEvent.click(button);
    expect(picker()).toBeInTheDocument();
    fireEvent.click(button);
    expect(picker()).not.toBeInTheDocument();
  });
});
