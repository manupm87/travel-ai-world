import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import {
  applyItineraryOps,
  EMPTY_ITINERARY,
  type ItineraryDraft,
  type OptionGroupState,
} from "@/hooks/plannerReducer";
import type { OptionCard, Slot } from "@/types/planner";
import {
  BATHS,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  NEIGHBOURHOODS,
} from "@/data/planner-demo/session";
import { OptionCarousel } from "./OptionCarousel";

const p = en.plan;
const PROMPT = "Where would you like to stay?";

const group = (overrides: Partial<OptionGroupState> = {}): OptionGroupState => ({
  group_id: GROUP_IDS.neighbourhoods,
  kind: "neighbourhood",
  prompt: PROMPT,
  slot: null,
  selection: "single",
  cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros, NEIGHBOURHOODS.budavar],
  selectedIds: [],
  dismissedIds: [],
  ...overrides,
});

function renderCarousel(
  overrides: Partial<OptionGroupState> = {},
  handlers: Partial<{
    onSelect: (groupId: string, cardIds: string[], slot?: Slot) => void;
    onDismiss: (groupId: string, cardId: string) => void;
    onToggleShortlist: (cardId: string) => void;
  }> = {},
  itinerary?: ItineraryDraft
) {
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const onToggleShortlist = vi.fn();
  const result = renderWithProviders(
    <OptionCarousel
      group={group(overrides)}
      shortlist={[]}
      itinerary={itinerary}
      onSelect={handlers.onSelect ?? onSelect}
      onDismiss={handlers.onDismiss ?? onDismiss}
      onToggleShortlist={handlers.onToggleShortlist ?? onToggleShortlist}
    />
  );
  return { ...result, onSelect, onDismiss, onToggleShortlist };
}

const cardNamed = (title: string) => screen.getByRole("article", { name: title });

describe("OptionCarousel", () => {
  it("is a labelled carousel region", () => {
    renderCarousel();

    const region = screen.getByRole("region", {
      name: interpolate(p.carousel.label, { prompt: PROMPT }),
    });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByRole("button", { name: p.carousel.previous })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: p.carousel.next })).toBeInTheDocument();
  });

  it("reports a single choice with the group and the card id", () => {
    const { onSelect } = renderCarousel();

    fireEvent.click(within(cardNamed("Belváros")).getByRole("button", { name: p.card.choose }));

    // A neighbourhood carries no slot and needs none: it is not a day's activity.
    expect(onSelect).toHaveBeenCalledWith(
      GROUP_IDS.neighbourhoods,
      [NEIGHBOURHOODS.belvaros.id],
      undefined
    );
  });

  it("marks the chosen card and locks the others once the group is answered", () => {
    renderCarousel({ selectedIds: [NEIGHBOURHOODS.belvaros.id] });

    expect(within(cardNamed("Belváros")).getAllByText(p.card.chosen).length).toBeGreaterThan(0);
    for (const title of ["Erzsébetváros", "Budavár"]) {
      expect(within(cardNamed(title)).getByRole("button", { name: p.card.choose })).toBeDisabled();
    }
  });

  describe("unplaced cards (TRA-185)", () => {
    const found = {
      group_id: "found:1a2b3c4d",
      kind: "experience" as const,
      prompt: "Add any of these to your trip:",
      slot: null,
      cards: [BATHS.rudas, BATHS.szechenyi],
    };
    const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);
    const sp = p.slotPicker;

    it("asks for the day and the part, then reports the slot with the pick", () => {
      const { onSelect } = renderCarousel(found, {}, itinerary);

      fireEvent.click(
        within(cardNamed("Rudas Baths")).getByRole("button", { name: p.card.addToTrip })
      );
      fireEvent.click(
        within(screen.getByRole("group", { name: sp.day })).getByRole("button", {
          name: interpolate(p.panel.day, { day: 3 }),
        })
      );
      fireEvent.click(
        within(screen.getByRole("group", { name: sp.part })).getByRole("button", {
          name: p.parts.evening,
        })
      );
      fireEvent.click(screen.getByRole("button", { name: sp.confirm }));

      expect(onSelect).toHaveBeenCalledWith(found.group_id, [BATHS.rudas.id], {
        day: 3,
        part: "evening",
      });
    });

    it("keeps a neighbourhood group placing nothing, although it has no slot", () => {
      renderCarousel({}, {}, itinerary);

      expect(screen.getAllByRole("button", { name: p.card.choose }).length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("button", { name: p.card.addToTrip })
      ).not.toBeInTheDocument();
    });

    it("picks one slot for a whole multi-selection batch, in the footer", () => {
      const { onSelect } = renderCarousel(
        { ...found, selection: "multi" },
        {},
        itinerary
      );

      fireEvent.click(within(cardNamed("Rudas Baths")).getByRole("checkbox"));
      fireEvent.click(within(cardNamed("Széchenyi Baths")).getByRole("checkbox"));
      // The cards themselves offer no picker: the batch shares one.
      expect(
        screen.queryByRole("button", { name: p.card.addToTrip })
      ).not.toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: interpolate(p.card.addCount, { count: 2 }) })
      );
      fireEvent.click(
        within(screen.getByRole("group", { name: sp.day })).getByRole("button", {
          name: interpolate(p.panel.day, { day: 2 }),
        })
      );
      fireEvent.click(screen.getByRole("button", { name: sp.confirm }));

      expect(onSelect).toHaveBeenCalledWith(
        found.group_id,
        [BATHS.rudas.id, BATHS.szechenyi.id],
        { day: 2, part: "morning" }
      );
    });
  });

  it("collects several cards and commits them with the footer button", () => {
    const { onSelect } = renderCarousel({
      group_id: GROUP_IDS.baths,
      kind: "experience",
      selection: "multi",
      prompt: "Thermal baths",
      cards: [BATHS.rudas, BATHS.szechenyi, BATHS.veliBej],
    });

    expect(
      screen.getByRole("button", { name: interpolate(p.card.addCount, { count: 0 }) })
    ).toBeDisabled();

    fireEvent.click(within(cardNamed("Rudas Baths")).getByRole("checkbox"));
    fireEvent.click(within(cardNamed("Széchenyi Baths")).getByRole("checkbox"));
    fireEvent.click(
      screen.getByRole("button", { name: interpolate(p.card.addCount, { count: 2 }) })
    );

    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.baths, [
      BATHS.rudas.id,
      BATHS.szechenyi.id,
    ]);
  });

  it("dismisses a card and stops rendering it", () => {
    const { onDismiss, rerender } = renderCarousel();

    fireEvent.click(
      within(cardNamed("Belváros")).getByRole("button", { name: p.card.notInterested })
    );
    expect(onDismiss).toHaveBeenCalledWith(GROUP_IDS.neighbourhoods, NEIGHBOURHOODS.belvaros.id);

    rerender(
      <OptionCarousel
        group={group({ dismissedIds: [NEIGHBOURHOODS.belvaros.id] })}
        shortlist={[]}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
        onToggleShortlist={vi.fn()}
      />
    );
    expect(screen.queryByRole("article", { name: "Belváros" })).not.toBeInTheDocument();
  });

  it("shows the price as a tier and never as a number", () => {
    const priced: OptionCard = {
      ...NEIGHBOURHOODS.belvaros,
      id: "wv:obuda",
      title: "Óbuda",
      subtitle: null,
      district: null,
      hours: null,
      price_tier: 2,
      why: "Roman ruins and quiet riverside streets",
      // The image-credit overlay carries its own licence version ("CC BY-SA
      // 4.0"), which is not a price: this card has no credit so the assertion
      // below stays about the copy the card writes itself.
      image_credit: null,
      license: "",
    };
    renderCarousel({ cards: [priced] });

    const card = cardNamed("Óbuda");
    expect(card).toHaveTextContent(p.priceTiers["2"]);
    expect(card.textContent ?? "").not.toMatch(/\d/);
  });

  it("opens the source in a safe new tab", () => {
    renderCarousel();

    const link = within(cardNamed("Belváros")).getByRole("link");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("target", "_blank");
  });
});
