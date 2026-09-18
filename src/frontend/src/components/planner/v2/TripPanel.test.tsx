import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import {
  EMPTY_ITINERARY,
  applyItineraryOps,
  initialPlannerState,
  type OptionGroupState,
  type PlannerState,
} from "@/hooks/plannerReducer";
import {
  BATHS,
  BRIEF_COMPLETE,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  HOTELS,
} from "@/test/fixtures/planner-budapest";
import { TripPanel } from "./TripPanel";

const p = en.plan.panel;
const DEEP_LINK = "https://www.google.com/travel/flights?q=Flights%20from%20MAD%20to%20BUD";

const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

const bathsGroup: OptionGroupState = {
  group_id: GROUP_IDS.baths,
  kind: "experience",
  prompt: "Thermal baths for day 2 · afternoon",
  slot: { day: 2, part: "afternoon" },
  selection: "single",
  cards: [BATHS.rudas, BATHS.szechenyi, BATHS.veliBej],
  selectedIds: [],
  dismissedIds: [],
};

function renderPanel(state: Partial<PlannerState> = {}) {
  const handlers = {
    onGenerate: vi.fn(),
    onRemove: vi.fn(),
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    onToggleShortlist: vi.fn(),
    onAskAlternatives: vi.fn(),
    onReset: vi.fn(),
  };
  const full: PlannerState = {
    ...initialPlannerState(),
    brief: BRIEF_COMPLETE,
    missing: [],
    itinerary,
    ...state,
  };
  renderWithProviders(<TripPanel state={full} {...handlers} />);
  return handlers;
}

const dayHeader = (day: number) => screen.getByRole("button", { name: new RegExp(`Day ${day}`) });

describe("TripPanel", () => {
  it("renders the draft trip: heading, counters, route, stay and days", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: interpolate(p.heading, { count: 5, destination: "Budapest" }),
      })
    ).toBeInTheDocument();
    expect(screen.getByText(p.draft)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: HOTELS.rum.title })).toBeInTheDocument();
    expect(screen.getByText(p.priceNote)).toBeInTheDocument();

    const flights = screen.getAllByRole("link", { name: p.searchFlights });
    expect(flights[0]).toHaveAttribute("href", DEEP_LINK);
    expect(flights[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));

    // Saving is not wired yet; the button says why.
    const save = screen.getByRole("button", { name: p.save });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("title", p.saveHint);
  });

  it("never shows a number next to a price", () => {
    renderPanel();

    expect(document.body.textContent ?? "").not.toMatch(/\d+\s?€/);
  });

  it("starts over from the header", () => {
    const { onReset } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: p.reset }));

    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("opens the alternatives for a slot and passes the choice up", () => {
    const { onSelect } = renderPanel({ groups: { [GROUP_IDS.baths]: bathsGroup } });

    fireEvent.click(dayHeader(2));
    fireEvent.click(screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` }));

    const dialog = screen.getByRole("dialog", {
      name: interpolate(en.plan.alternatives.slot, { day: 2, part: en.plan.parts.afternoon }),
    });
    expect(within(dialog).getByRole("article", { name: BATHS.rudas.title })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("article", { name: BATHS.szechenyi.title })
    ).toBeInTheDocument();
    // The card already in the slot is not one of its own alternatives.
    expect(
      within(dialog).queryByRole("article", { name: BATHS.gellert.title })
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(within(dialog).getByRole("article", { name: BATHS.rudas.title })).getByRole("button", {
        name: interpolate(en.plan.card.addToSlot, { day: 2, part: en.plan.parts.afternoon }),
      })
    );

    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.baths, [BATHS.rudas.id]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks the chat for options when the slot has no group", () => {
    const { onAskAlternatives } = renderPanel();

    fireEvent.click(dayHeader(2));
    fireEvent.click(screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` }));

    expect(screen.getByText(en.plan.alternatives.none)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.plan.alternatives.askMore }));

    expect(onAskAlternatives).toHaveBeenCalledWith({ day: 2, part: "afternoon" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("removes a card from its slot", () => {
    const { onRemove } = renderPanel();

    fireEvent.click(dayHeader(2));
    fireEvent.click(screen.getByRole("button", { name: `${p.remove}: ${BATHS.gellert.title}` }));

    expect(onRemove).toHaveBeenCalledWith({ day: 2, part: "afternoon" }, BATHS.gellert.id);
  });

  it("shows the checklist while there is no itinerary", () => {
    const { onGenerate } = renderPanel({ itinerary: EMPTY_ITINERARY, missing: [] });

    expect(screen.getByText(en.plan.checklist.title)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: interpolate(p.heading, { count: 5, destination: "Budapest" }) })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.plan.checklist.generate }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
