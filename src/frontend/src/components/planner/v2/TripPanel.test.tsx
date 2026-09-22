import { useState, type ComponentProps } from "react";
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
import type { UseSaveTripResult } from "@/hooks/useSaveTrip";
import {
  ACTIVITIES,
  BATHS,
  BRIEF_COMPLETE,
  FIRST_ITINERARY_OPS,
  GROUP_IDS,
  HOTELS,
} from "@/data/planner-demo/session";
import { toMapStops } from "./mapStops";
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

function renderPanel(
  state: Partial<PlannerState> = {},
  save: Partial<UseSaveTripResult> = {},
  props: Partial<ComponentProps<typeof TripPanel>> = {}
) {
  const onSave = vi.fn();
  const handlers = {
    onGenerate: vi.fn(),
    onRemove: vi.fn(),
    onSelect: vi.fn(),
    onDismiss: vi.fn(),
    onToggleShortlist: vi.fn(),
    onAskAlternatives: vi.fn(),
    onReset: vi.fn(),
  };
  const saveState: UseSaveTripResult = {
    status: "idle",
    tripId: null,
    canSave: true,
    save: onSave,
    ...save,
  };
  const full: PlannerState = {
    ...initialPlannerState(),
    brief: BRIEF_COMPLETE,
    missing: [],
    itinerary,
    ...state,
  };

  // The selected day, the pins and the selected pin belong to the page, so the
  // panel is driven here exactly as `PlannerClientPage` drives it.
  function Harness({ state: current }: { state: PlannerState }) {
    const [selectedDay, setSelectedDay] = useSelectedDay(current.itinerary);
    const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
    const mapStops = toMapStops(current.itinerary, selectedDay);
    return (
      <TripPanel
        state={current}
        selectedDay={selectedDay}
        onSelectDay={(day) => {
          setSelectedStopId(null);
          setSelectedDay(day);
        }}
        city={null}
        mapStops={mapStops}
        selectedStopId={selectedStopId}
        onSelectStop={setSelectedStopId}
        save={saveState}
        {...handlers}
        {...props}
      />
    );
  }

  const view = renderWithProviders(<Harness state={full} />);
  return {
    ...handlers,
    onSave,
    setState: (next: Partial<PlannerState>) =>
      view.rerender(<Harness state={{ ...full, ...next }} />),
  };
}

/** A stop's row: the button that opens the activity in the middle column. */
const openRow = (title: string) =>
  screen.getByRole("button", { name: interpolate(en.plan.detail.open, { title }) });

const queryRow = (title: string) =>
  screen.queryByRole("button", { name: interpolate(en.plan.detail.open, { title }) });

/** The parts of the day on screen; gone while an activity is open. */
const partRegion = (day: number, part: keyof typeof en.plan.parts) =>
  `${interpolate(p.day, { day })} · ${en.plan.parts[part]}`;

const dayTab = (day: number) =>
  within(screen.getByRole("tablist", { name: p.daysNav })).getByRole("tab", {
    name: new RegExp(`Day ${day}`),
  });

/** The strip's leading chip: back to the whole trip. */
const wholeTripTab = () =>
  within(screen.getByRole("tablist", { name: p.daysNav })).getByRole("tab", {
    name: p.wholeTrip,
  });

/** The panel opens on the overview (TRA-177); this is how a day gets on screen. */
const openDay = (day: number) => fireEvent.click(dayTab(day));

describe("TripPanel", () => {
  it("opens on the trip overview, with the strip above it", () => {
    renderPanel();

    // The whole trip, not day 1: the day list and the destination's photos.
    expect(screen.getByRole("list", { name: p.dayList })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: p.overview })).toBeInTheDocument();
    expect(wholeTripTab()).toHaveAttribute("aria-selected", "true");
    expect(dayTab(1)).toHaveAttribute("aria-selected", "false");
    // No day is on screen, so no part of a day is either.
    expect(screen.queryByRole("region", { name: partRegion(1, "morning") })).not.toBeInTheDocument();
    // The stay is above the overview, as plain text: nothing to select.
    expect(queryRow(HOTELS.rum.title)).not.toBeInTheDocument();
    expect(screen.getByText(HOTELS.rum.title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${p.change}: ${HOTELS.rum.title}` })).toBeInTheDocument();
  });

  it("opens a day from the overview, and the strip brings the whole trip back", () => {
    renderPanel();

    fireEvent.click(
      within(screen.getByRole("list", { name: p.dayList })).getByRole("button", {
        name: new RegExp(interpolate(p.openDay, { day: 2 })),
      })
    );

    expect(dayTab(2)).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tabpanel", { name: interpolate(p.day, { day: 2 }) })
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: p.dayList })).not.toBeInTheDocument();

    fireEvent.click(wholeTripTab());

    expect(screen.getByRole("tabpanel", { name: p.overview })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: p.dayList })).toBeInTheDocument();
  });

  it("scrolls back to the top when a day is opened from the overview", () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    // jsdom has no element scrolling at all, which is why the component guards
    // the call; this is the spy the guard lets through.
    HTMLElement.prototype.scrollTo = scrollTo;

    try {
      renderPanel();
      expect(scrollTo).not.toHaveBeenCalled();

      // The day rows sit at the bottom of a tall overview: arriving on the day
      // without this leaves the strip — the way back — off screen.
      openDay(2);
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });

      scrollTo.mockClear();
      fireEvent.click(wholeTripTab());
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("closes an open activity when the whole trip comes back", () => {
    renderPanel();

    openDay(1);
    fireEvent.click(openRow(ACTIVITIES.greatMarket.title));
    expect(
      screen.getByRole("heading", { level: 3, name: ACTIVITIES.greatMarket.title })
    ).toBeInTheDocument();

    fireEvent.click(wholeTripTab());

    expect(
      screen.queryByRole("heading", { level: 3, name: ACTIVITIES.greatMarket.title })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel", { name: p.overview })).toBeInTheDocument();
  });

  it("renders the draft trip: heading, counters, route, stay and days", () => {
    renderPanel();
    openDay(1);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: interpolate(p.heading, { count: 3, destination: "Budapest" }),
      })
    ).toBeInTheDocument();
    expect(screen.getByText(p.draft)).toBeInTheDocument();
    expect(openRow(HOTELS.rum.title)).toBeInTheDocument();
    expect(screen.getByText(p.priceNote)).toBeInTheDocument();

    const flights = screen.getAllByRole("link", { name: p.searchFlights });
    expect(flights[0]).toHaveAttribute("href", DEEP_LINK);
    expect(flights[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));

  });

  it("saves the draft from the header", () => {
    const { onSave } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: p.save }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("says why saving is unavailable while a recorded session answers", () => {
    renderPanel({}, { canSave: false });

    const save = screen.getByRole("button", { name: p.save });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute("title", p.saveHint);
  });

  it("shows the write in progress", () => {
    renderPanel({}, { status: "saving" });

    const saving = screen.getByRole("button", { name: p.saving });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
  });

  it("offers the way into the trip once it is saved", () => {
    renderPanel({}, { status: "saved", tripId: "trip-42" });

    expect(screen.getByText(p.saved)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.save })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: p.openTrip })).toHaveAttribute(
      "href",
      "/trip?id=trip-42"
    );
  });

  it("offers the failed save again", () => {
    const { onSave } = renderPanel({}, { status: "error" });

    expect(screen.getByText(p.saveError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: p.saveRetry }));

    expect(onSave).toHaveBeenCalledTimes(1);
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

    // The sheet always knows the slot and sends it with the pick (TRA-185).
    expect(onSelect).toHaveBeenCalledWith(GROUP_IDS.baths, [BATHS.rudas.id], {
      day: 2,
      part: "afternoon",
    });
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

    // "More options" asks for the next page, and keeps the sheet open.
    fireEvent.click(screen.getByRole("button", { name: en.plan.alternatives.more }));
    expect(onAskAlternatives).toHaveBeenLastCalledWith(
      { day: 2, part: "afternoon" },
      { more: true }
    );
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
    openDay(1);

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

  it("numbers the cards of the selected day with their pin, in slot order", () => {
    renderPanel();
    openDay(1);

    // The stay carries the map's "H" pin; the day's cards are numbered.
    expect(openRow(HOTELS.rum.title)).toHaveAttribute("data-stop-index", "H");
    expect(openRow(ACTIVITIES.greatMarket.title)).toHaveAttribute("data-stop-index", "1");
    expect(queryRow(BATHS.gellert.title)).not.toBeInTheDocument();

    fireEvent.click(dayTab(2));

    expect(openRow(ACTIVITIES.fishermansBastion.title)).toHaveAttribute("data-stop-index", "1");
    expect(openRow(BATHS.gellert.title)).toHaveAttribute("data-stop-index", "2");
    expect(queryRow(ACTIVITIES.greatMarket.title)).not.toBeInTheDocument();
  });

  it("opens the activity in place of the day, and the back button closes it", () => {
    renderPanel();
    openDay(1);

    const row = openRow(ACTIVITIES.greatMarket.title);
    expect(row).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(row);

    // The middle column is the activity now: its heading is there and the
    // parts of the day are not.
    expect(
      screen.getByRole("heading", { level: 3, name: ACTIVITIES.greatMarket.title })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: partRegion(1, "morning") })
    ).not.toBeInTheDocument();
    // The day strip stays: another day is one click away.
    expect(dayTab(2)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: interpolate(en.plan.detail.backToDay, { day: 1 }) })
    );

    expect(openRow(ACTIVITIES.greatMarket.title)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("region", { name: partRegion(1, "morning") })).toBeInTheDocument();
  });

  it("gives the keyboard the way back, and the row again when the activity closes", () => {
    renderPanel();
    openDay(1);

    const row = openRow(ACTIVITIES.greatMarket.title);
    fireEvent.click(row);

    // The row is gone with the day: focus follows the view, or the next Tab
    // would restart at the top of the page.
    const back = screen.getByRole("button", {
      name: interpolate(en.plan.detail.backToDay, { day: 1 }),
    });
    expect(document.activeElement).toBe(back);

    fireEvent.click(back);

    expect(document.activeElement).toBe(openRow(ACTIVITIES.greatMarket.title));
  });

  it("closes only the alternatives sheet when Escape is pressed over it", () => {
    renderPanel();
    openDay(1);

    fireEvent.click(openRow(ACTIVITIES.greatMarket.title));
    fireEvent.click(
      screen.getByRole("button", { name: `${p.change}: ${ACTIVITIES.greatMarket.title}` })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Both views listen on `document`; the topmost one is the one that answers.
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: ACTIVITIES.greatMarket.title })
    ).toBeInTheDocument();

    // With the sheet gone, Escape is the activity's again.
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("region", { name: partRegion(1, "morning") })).toBeInTheDocument();
  });

  it("opens the stay with the same row, and removing a card goes back to the day", () => {
    const { onRemove } = renderPanel();
    openDay(1);

    // The day's panel is named after the day it holds…
    expect(screen.getByRole("tabpanel", { name: interpolate(p.day, { day: 1 }) })).toBeInTheDocument();

    fireEvent.click(openRow(HOTELS.rum.title));
    expect(screen.getByRole("heading", { level: 3, name: HOTELS.rum.title })).toBeInTheDocument();
    // …and after the stay while the stay's page is what it holds: the hotel is
    // the same on every day, and calling it "Day 1" would mislead a reader.
    expect(screen.getByRole("tabpanel", { name: p.stayNoNights })).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: interpolate(p.day, { day: 1 }) })
    ).not.toBeInTheDocument();
    // The stay belongs to no day, so its way back says so.
    const backToStay = screen.getByRole("button", { name: en.plan.detail.backToStay });

    fireEvent.click(backToStay);
    fireEvent.click(openRow(ACTIVITIES.greatMarket.title));
    fireEvent.click(
      screen.getByRole("button", { name: `${p.remove}: ${ACTIVITIES.greatMarket.title}` })
    );

    expect(onRemove).toHaveBeenCalledWith({ day: 1, part: "morning" }, ACTIVITIES.greatMarket.id);
    expect(screen.getByRole("region", { name: partRegion(1, "morning") })).toBeInTheDocument();
  });

  it("falls back to the overview when the itinerary is emptied and rebuilt", () => {
    const { setState } = renderPanel();

    fireEvent.click(dayTab(3));
    expect(dayTab(3)).toHaveAttribute("aria-selected", "true");

    // "Start over" empties the itinerary, then a new one arrives.
    setState({ itinerary: EMPTY_ITINERARY });
    expect(screen.getByRole("heading", { name: p.emptyTitle })).toBeInTheDocument();

    setState({ itinerary });
    expect(wholeTripTab()).toHaveAttribute("aria-selected", "true");
    expect(dayTab(3)).toHaveAttribute("aria-selected", "false");
  });

  it("falls back to the overview when the trip is regenerated shorter", () => {
    const { setState } = renderPanel();

    fireEvent.click(dayTab(3));
    expect(dayTab(3)).toHaveAttribute("aria-selected", "true");

    // A two-day trip replaces the three-day one in one go: day 3 is gone.
    setState({ itinerary: { ...itinerary, days: itinerary.days.slice(0, 2) } });

    expect(wholeTripTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: p.overview })).toBeInTheDocument();
    // Two days left, plus the leading chip for the whole trip.
    expect(
      within(screen.getByRole("tablist", { name: p.daysNav })).getAllByRole("tab")
    ).toHaveLength(3);
  });

  it("offers nothing core_api would refuse on a trip that is over", () => {
    renderPanel({}, {}, { lockedPhase: "past" });

    expect(screen.getByText(en.plan.trips.phase.past)).toBeInTheDocument();
    expect(screen.queryByText(p.draft)).toBeNull();
    expect(screen.queryByRole("button", { name: p.save })).toBeNull();
    expect(screen.queryByRole("button", { name: p.reset })).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(`^${p.change}`) })).toBeNull();

    // The trip itself is still there to read.
    expect(
      screen.getByRole("heading", {
        name: interpolate(p.heading, { count: 3, destination: "Budapest" }),
      })
    ).toBeInTheDocument();
  });

  it("says what `?trip=` is doing instead of leaving the pane blank", () => {
    renderPanel({}, {}, { openTrip: { status: "not-found" } });

    expect(screen.getByRole("alert")).toHaveTextContent(en.plan.trips.notFoundTitle);
    // The way on is the home, where the trips are listed — not a sheet here.
    expect(
      screen.getByRole("link", { name: en.plan.trips.title }).getAttribute("href")
    ).toMatch(/^\/dashboard\/?$/);
  });

  it("offers a new trip beside the way home when the trip is not there (TRA-223)", () => {
    const onNewTrip = vi.fn();
    renderPanel({}, {}, { openTrip: { status: "not-found" }, onNewTrip });

    fireEvent.click(screen.getByRole("button", { name: en.plan.trips.newTrip }));

    expect(onNewTrip).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: en.plan.trips.title })).toBeInTheDocument();
  });

  describe("New trip in the header (TRA-223)", () => {
    const newTripButton = () => screen.queryByRole("button", { name: en.plan.trips.newTrip });

    it("is there while a saved trip is open, and leaves it", () => {
      const onNewTrip = vi.fn();
      renderPanel({}, { tripId: "trip-1" }, { onNewTrip });

      fireEvent.click(newTripButton()!);

      expect(onNewTrip).toHaveBeenCalledTimes(1);
    });

    it("is not there before the draft is saved", () => {
      renderPanel({}, { tripId: null }, { onNewTrip: vi.fn() });

      expect(newTripButton()).toBeNull();
    });

    it("is not there on a locked trip, which has its own", () => {
      renderPanel({}, { tripId: "trip-1" }, { onNewTrip: vi.fn(), lockedPhase: "past" });

      expect(newTripButton()).toBeNull();
    });
  });

  it("shows the placeholder, not a trips list, before the conversation starts", () => {
    renderPanel({ itinerary: EMPTY_ITINERARY, missing: [] });

    expect(screen.getByRole("heading", { name: p.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(p.emptyDescription)).toBeInTheDocument();
    // The trips live on `/dashboard/` (TRA-201): nothing here lists them.
    expect(screen.queryByRole("heading", { name: en.plan.trips.title })).toBeNull();
    expect(screen.queryByText(en.plan.trips.groups.upcoming)).toBeNull();
    expect(screen.queryByText(en.plan.checklist.title)).not.toBeInTheDocument();
  });

  it("shows the checklist once the conversation has started", () => {
    const { onGenerate } = renderPanel({
      itinerary: EMPTY_ITINERARY,
      missing: [],
      messages: [{ id: "m1", kind: "text", role: "user", content: "3 days in Budapest" }],
    });

    expect(screen.getByText(en.plan.checklist.title)).toBeInTheDocument();
    expect(screen.queryByText(p.emptyTitle)).toBeNull();
    expect(
      screen.queryByRole("heading", { name: interpolate(p.heading, { count: 3, destination: "Budapest" }) })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.plan.checklist.generate }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("carries no way to a trips list on an itinerary either", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: en.plan.trips.title })).toBeNull();
    expect(screen.getByRole("button", { name: p.save })).toBeInTheDocument();
  });
});
