import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import type { OptionGroupState } from "@/hooks/plannerReducer";
import type { OptionCard } from "@/types/planner";
import { BATHS, GROUP_IDS, NEIGHBOURHOODS } from "@/test/fixtures/planner-budapest";
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
    onSelect: (groupId: string, cardIds: string[]) => void;
    onDismiss: (groupId: string, cardId: string) => void;
    onToggleShortlist: (cardId: string) => void;
  }> = {}
) {
  const onSelect = vi.fn();
  const onDismiss = vi.fn();
  const onToggleShortlist = vi.fn();
  const result = renderWithProviders(
    <OptionCarousel
      group={group(overrides)}
      shortlist={[]}
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

    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.neighbourhoods, ["wv:belvaros"]);
  });

  it("marks the chosen card and locks the others once the group is answered", () => {
    renderCarousel({ selectedIds: ["wv:belvaros"] });

    expect(within(cardNamed("Belváros")).getAllByText(p.card.chosen).length).toBeGreaterThan(0);
    for (const title of ["Erzsébetváros", "Budavár"]) {
      expect(within(cardNamed(title)).getByRole("button", { name: p.card.choose })).toBeDisabled();
    }
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
      "wv:rudas-baths",
      "wv:szechenyi-baths",
    ]);
  });

  it("dismisses a card and stops rendering it", () => {
    const { onDismiss, rerender } = renderCarousel();

    fireEvent.click(
      within(cardNamed("Belváros")).getByRole("button", { name: p.card.notInterested })
    );
    expect(onDismiss).toHaveBeenCalledWith(GROUP_IDS.neighbourhoods, "wv:belvaros");

    rerender(
      <OptionCarousel
        group={group({ dismissedIds: ["wv:belvaros"] })}
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
