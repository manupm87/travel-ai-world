import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { applyItineraryOps, EMPTY_ITINERARY, type ItineraryDraft } from "@/hooks/plannerReducer";
import { BATHS, FIRST_ITINERARY_OPS } from "@/data/planner-demo/session";
import { firstEmptyPart, SlotPicker } from "./SlotPicker";

const sp = en.plan.slotPicker;
/** The recorded session: three days, every part of each one filled. */
const ITINERARY = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

/** Day 1's morning and day 2's morning + afternoon taken; the rest is free. */
const PARTIAL = applyItineraryOps(EMPTY_ITINERARY, [
  { op: "put_activity", slot: { day: 1, part: "morning" }, card: BATHS.rudas },
  { op: "put_activity", slot: { day: 2, part: "morning" }, card: BATHS.gellert },
  { op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.szechenyi },
  { op: "set_day_title", day: 3, title: "Free" },
]);

const dayLabel = (day: number) => interpolate(en.plan.panel.day, { day });

function renderPicker(
  overrides: { days?: number[]; itinerary?: ItineraryDraft; day?: number | null } = {}
) {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  const result = renderWithProviders(
    <SlotPicker
      days={overrides.days ?? [1, 2, 3]}
      itinerary={overrides.itinerary ?? ITINERARY}
      day={overrides.day ?? null}
      onPick={onPick}
      onCancel={onCancel}
    />
  );
  return { ...result, onPick, onCancel };
}

const dayRow = () => screen.getByRole("group", { name: sp.day });
const partRow = () => screen.getByRole("group", { name: sp.part });
const pressed = (row: HTMLElement) =>
  within(row)
    .getAllByRole("button")
    .find((button) => button.getAttribute("aria-pressed") === "true");

describe("SlotPicker", () => {
  it("offers every day of the trip and the four parts of a day", () => {
    renderPicker();

    expect(screen.getByRole("group", { name: sp.title })).toBeInTheDocument();
    expect(within(dayRow()).getAllByRole("button").map((b) => b.textContent)).toEqual([
      dayLabel(1),
      dayLabel(2),
      dayLabel(3),
    ]);
    expect(within(partRow()).getAllByRole("button").map((b) => b.textContent)).toEqual([
      en.plan.parts.morning,
      en.plan.parts.afternoon,
      en.plan.parts.evening,
      en.plan.parts.night,
    ]);
  });

  it("opens on the given day with its first empty part preselected", () => {
    renderPicker({ itinerary: PARTIAL, day: 1 });

    expect(pressed(dayRow())?.textContent).toBe(dayLabel(1));
    expect(pressed(partRow())?.textContent).toBe(en.plan.parts.afternoon);
  });

  it("falls back to the morning when every part of the day is taken", () => {
    renderPicker({ day: 1 });

    expect(pressed(partRow())?.textContent).toBe(en.plan.parts.morning);
  });

  it("opens on the first day when the given one is not in the trip", () => {
    renderPicker({ days: [2, 3], day: 9 });

    expect(pressed(dayRow())?.textContent).toBe(dayLabel(2));
  });

  it("takes the morning when the day holds nothing yet", () => {
    renderPicker({ days: [1], itinerary: EMPTY_ITINERARY });

    expect(pressed(partRow())?.textContent).toBe(en.plan.parts.morning);
  });

  it("confirms the day and the part chosen", () => {
    const { onPick } = renderPicker({ day: 1 });

    fireEvent.click(within(dayRow()).getByRole("button", { name: dayLabel(2) }));
    fireEvent.click(
      within(partRow()).getByRole("button", { name: en.plan.parts.afternoon })
    );
    fireEvent.click(screen.getByRole("button", { name: sp.confirm }));

    expect(onPick).toHaveBeenCalledWith({ day: 2, part: "afternoon" });
  });

  it("moves along the day row with the arrows", () => {
    const { onPick } = renderPicker({ itinerary: PARTIAL, day: 1 });

    fireEvent.keyDown(dayRow(), { key: "ArrowRight" });
    expect(pressed(dayRow())?.textContent).toBe(dayLabel(2));
    fireEvent.keyDown(dayRow(), { key: "ArrowLeft" });
    expect(pressed(dayRow())?.textContent).toBe(dayLabel(1));

    // Past the ends nothing moves.
    fireEvent.keyDown(dayRow(), { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: sp.confirm }));
    expect(onPick).toHaveBeenCalledWith({ day: 1, part: "afternoon" });
  });

  it("follows a new day to its own first empty part", () => {
    // Day 2 holds a morning and an afternoon: its evening is the first free one.
    const { onPick } = renderPicker({ itinerary: PARTIAL, day: 1 });

    fireEvent.click(within(dayRow()).getByRole("button", { name: dayLabel(2) }));
    fireEvent.click(screen.getByRole("button", { name: sp.confirm }));

    expect(onPick).toHaveBeenCalledWith({ day: 2, part: "evening" });
    expect(firstEmptyPart(PARTIAL, 2)).toBe("evening");
  });

  it("cancels with the button and with Escape", () => {
    const { onCancel } = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: sp.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("group", { name: sp.title }), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("puts the focus on the day row so the arrows work at once", () => {
    renderPicker({ day: 1 });

    expect(document.activeElement).toBe(
      within(dayRow()).getByRole("button", { name: dayLabel(1) })
    );
  });
});

describe("firstEmptyPart", () => {
  it("is the morning for a day the itinerary does not know", () => {
    expect(firstEmptyPart(ITINERARY, 42)).toBe("morning");
  });

  it("is the first part with nothing in it", () => {
    const itinerary = applyItineraryOps(EMPTY_ITINERARY, [
      { op: "put_activity", slot: { day: 1, part: "morning" }, card: BATHS.rudas },
    ]);
    expect(firstEmptyPart(itinerary, 1)).toBe("afternoon");
  });

  it("falls back to the morning when every part is taken", () => {
    const itinerary = applyItineraryOps(
      EMPTY_ITINERARY,
      (["morning", "afternoon", "evening", "night"] as const).map((part) => ({
        op: "put_activity" as const,
        slot: { day: 1, part },
        card: BATHS.rudas,
      }))
    );
    expect(firstEmptyPart(itinerary, 1)).toBe("morning");
  });
});
