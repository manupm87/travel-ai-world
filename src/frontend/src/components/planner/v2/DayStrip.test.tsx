import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import { FIRST_ITINERARY_OPS } from "@/data/planner-demo/session";
import { DayStrip } from "./DayStrip";

const p = en.plan.panel;
const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

function renderStrip(overrides: Partial<ComponentProps<typeof DayStrip>> = {}) {
  const props = {
    days: itinerary.days,
    startDate: "2026-10-23",
    selectedDay: 1,
    onSelect: vi.fn(),
    ...overrides,
  };
  const view = renderWithProviders(<DayStrip {...props} />);
  return {
    ...props,
    rerender: (selectedDay: number) =>
      view.rerender(<DayStrip {...props} selectedDay={selectedDay} />),
  };
}

const strip = () => screen.getByRole("tablist", { name: p.daysNav });
const tabs = () => within(strip()).getAllByRole("tab");

describe("DayStrip", () => {
  it("shows one chip per day, with its date, forecast and how many experiences", () => {
    renderStrip();

    const chips = tabs();
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent(interpolate(p.day, { day: 1 }));
    expect(chips[2]).toHaveTextContent(interpolate(p.day, { day: 3 }));

    // Day 2 of a trip starting on the 23rd is the 24th; the recorded session
    // forecasts 13 °C and fills the four parts of the day.
    expect(chips[1]).toHaveTextContent("Sat, Oct 24");
    expect(chips[1]).toHaveTextContent("13 °C");
    expect(chips[1]).toHaveTextContent(interpolate(p.experiences, { count: 4 }));
  });

  it("marks the selected day and keeps the roving tab stop on it", () => {
    renderStrip({ selectedDay: 2 });

    const [first, second, third] = tabs();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("aria-selected", "false");
    expect(first).toHaveAttribute("tabindex", "-1");
    expect(third).toHaveAttribute("aria-selected", "false");
  });

  it("picks a day with a click", () => {
    const { onSelect } = renderStrip();

    fireEvent.click(within(strip()).getByRole("tab", { name: /Day 3/ }));

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("moves along the strip with the arrows, Home and End", () => {
    const { onSelect } = renderStrip({ selectedDay: 2 });

    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(strip(), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(1);

    fireEvent.keyDown(strip(), { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(strip(), { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(1);

    expect(onSelect).toHaveBeenCalledTimes(4);
  });

  it("wraps around at both ends and ignores other keys", () => {
    const { onSelect } = renderStrip({ selectedDay: 1 });

    fireEvent.keyDown(strip(), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(strip(), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("drives the day panel it is given", () => {
    renderStrip({ panelId: "day-panel" });

    for (const tab of tabs()) {
      expect(tab).toHaveAttribute("aria-controls", "day-panel");
    }
  });

  it("keeps the selected chip in sight without ever scrolling its ancestors", () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = renderStrip();
      // The strip sits inside the panel's vertical scroller: `scrollIntoView`
      // would pull the heading, the route and the map off screen — on mount and
      // on every day a streamed patch adds.
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(3);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("drops the date when the trip has no start date", () => {
    renderStrip({ startDate: null });

    expect(strip()).not.toHaveTextContent("Oct");
    expect(tabs()[0]).toHaveTextContent(interpolate(p.day, { day: 1 }));
  });
});
