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
import { useSelectedDay } from "@/hooks/useSelectedDay";
import {
  ACTIVITIES,
  BATHS,
  BRIEF_COMPLETE,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  HOTELS,
} from "@/data/planner-demo/session";
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

  // The selected day belongs to the page, so the panel is driven here exactly
  // as `PlannerClientPage` drives it.
  function Harness({ state: current }: { state: PlannerState }) {
    const [selectedDay, setSelectedDay] = useSelectedDay(current.itinerary);
    return (
      <TripPanel
        state={current}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        {...handlers}
      />
    );
  }

  const view = renderWithProviders(<Harness state={full} />);
  return {
    ...handlers,
    setState: (next: Partial<PlannerState>) =>
      view.rerender(<Harness state={{ ...full, ...next }} />),
  };
}

const dayTab = (day: number) =>
  within(screen.getByRole("tablist", { name: p.daysNav })).getByRole("tab", {
    name: new RegExp(`Day ${day}`),
  });

describe("TripPanel", () => {
  it("renders the draft trip: heading, counters, route, stay and days", () => {
    renderPanel();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: interpolate(p.heading, { count: 3, destination: "Budapest" }),
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

    fireEvent.click(dayTab(2));
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

  it("asks the chat for options by itself when the slot has no group, and stays open", () => {
    const { onAskAlternatives } = renderPanel();

    fireEvent.click(dayTab(2));
    fireEvent.click(screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` }));

    // Asked once on opening, without a second click; the sheet waits for the answer.
    expect(onAskAlternatives).toHaveBeenCalledTimes(1);
    expect(onAskAlternatives).toHaveBeenCalledWith({ day: 2, part: "afternoon" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // "Ask for more" is still there for a second batch, and keeps the sheet open.
    fireEvent.click(screen.getByRole("button", { name: en.plan.alternatives.askMore }));
    expect(onAskAlternatives).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("removes a card from its slot", () => {
    const { onRemove } = renderPanel();

    fireEvent.click(dayTab(2));
    fireEvent.click(screen.getByRole("button", { name: `${p.remove}: ${BATHS.gellert.title}` }));

    expect(onRemove).toHaveBeenCalledWith({ day: 2, part: "afternoon" }, BATHS.gellert.id);
  });

  it("shows one day at a time and swaps it from the strip", () => {
    renderPanel();

    // Day 1 is the one on screen: its cards are there, day 2's are not.
    expect(dayTab(1)).toHaveAttribute("aria-selected", "true");
    expect(dayTab(2)).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("button", { name: `${p.change}: ${ACTIVITIES.greatMarket.title}` })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` })
    ).not.toBeInTheDocument();

    fireEvent.click(dayTab(2));

    expect(dayTab(2)).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `${p.change}: ${ACTIVITIES.greatMarket.title}` })
    ).not.toBeInTheDocument();

    // The day on screen is a panel of its own, named after the day.
    expect(
      screen.getByRole("tabpanel", { name: interpolate(p.day, { day: 2 }) })
    ).toBeInTheDocument();
  });

  it("maps only the selected day, numbered in slot order", () => {
    renderPanel();

    const stops = (day: number) =>
      within(screen.getByRole("list", { name: interpolate(p.stopsOfDay, { day }) }))
        .getAllByRole("listitem")
        .map((item) => item.textContent ?? "");

    // The stay opens the list, then the day's stops in slot order.
    const dayOne = stops(1);
    expect(dayOne[0]).toBe(`${p.stayNoNights} · ${HOTELS.rum.title}`);
    expect(dayOne[1]).toBe(`1${ACTIVITIES.greatMarket.title}`);
    expect(dayOne.some((label) => label.includes(BATHS.gellert.title))).toBe(false);

    fireEvent.click(dayTab(2));

    const dayTwo = stops(2);
    expect(dayTwo[1]).toBe(`1${ACTIVITIES.fishermansBastion.title}`);
    expect(dayTwo[2]).toBe(`2${BATHS.gellert.title}`);
    expect(dayTwo.some((label) => label.includes(ACTIVITIES.greatMarket.title))).toBe(false);
  });

  it("falls back to the first day when the itinerary is emptied and rebuilt", () => {
    const { setState } = renderPanel();

    fireEvent.click(dayTab(3));
    expect(dayTab(3)).toHaveAttribute("aria-selected", "true");

    // "Start over" empties the itinerary, then a new one arrives.
    setState({ itinerary: EMPTY_ITINERARY });
    expect(screen.getByText(en.plan.checklist.title)).toBeInTheDocument();

    setState({ itinerary });
    expect(dayTab(1)).toHaveAttribute("aria-selected", "true");
    expect(dayTab(3)).toHaveAttribute("aria-selected", "false");
  });

  it("falls back to the first day when the trip is regenerated shorter", () => {
    const { setState } = renderPanel();

    fireEvent.click(dayTab(3));
    expect(dayTab(3)).toHaveAttribute("aria-selected", "true");

    // A two-day trip replaces the three-day one in one go: day 3 is gone.
    setState({ itinerary: { ...itinerary, days: itinerary.days.slice(0, 2) } });

    expect(dayTab(1)).toHaveAttribute("aria-selected", "true");
    expect(
      within(screen.getByRole("tablist", { name: p.daysNav })).getAllByRole("tab")
    ).toHaveLength(2);
  });

  it("shows the checklist while there is no itinerary", () => {
    const { onGenerate } = renderPanel({ itinerary: EMPTY_ITINERARY, missing: [] });

    expect(screen.getByText(en.plan.checklist.title)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: interpolate(p.heading, { count: 3, destination: "Budapest" }) })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.plan.checklist.generate }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});
