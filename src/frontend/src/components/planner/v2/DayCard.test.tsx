import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import { BATHS, FIRST_ITINERARY_OPS } from "@/data/planner-demo/session";
import { DayCard } from "./DayCard";

const p = en.plan.panel;
const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);
const day2 = itinerary.days.find((d) => d.day === 2)!;

function renderDay(overrides: Partial<ComponentProps<typeof DayCard>> = {}) {
  const props = {
    day: day2,
    date: "2026-10-24",
    warnings: itinerary.warnings,
    onChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<DayCard {...props} />);
  return props;
}

const header = () => screen.getByRole("button", { name: /Day 2/ });

describe("DayCard", () => {
  it("summarises the day in the header and starts collapsed", () => {
    renderDay();

    expect(screen.getByText(interpolate(p.day, { day: 2 }))).toBeInTheDocument();
    expect(screen.getByText("Buda: the castle and thermal baths")).toBeInTheDocument();
    expect(screen.getByText("13 °C")).toBeInTheDocument();
    expect(screen.getByText(interpolate(p.experiences, { count: 4 }))).toBeInTheDocument();

    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` })
    ).not.toBeInTheDocument();
  });

  it("expands into the four parts of the day and shows the slot's warning", () => {
    // An evening emptied by hand: the recorded trip fills every part.
    renderDay({ day: { ...day2, slots: { ...day2.slots, evening: [] } } });

    fireEvent.click(header());

    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(BATHS.gellert.title)).toBeVisible();

    const afternoon = screen.getByRole("region", {
      name: `${interpolate(p.day, { day: 2 })} · ${en.plan.parts.afternoon}`,
    });
    expect(
      within(afternoon).getByText("40 minutes on foot from the previous stop")
    ).toBeInTheDocument();

    // The empty parts still offer a way to fill them.
    const evening = screen.getByRole("region", {
      name: `${interpolate(p.day, { day: 2 })} · ${en.plan.parts.evening}`,
    });
    expect(within(evening).getByText(p.emptySlot)).toBeInTheDocument();
    expect(
      within(evening).getByRole("button", { name: `${p.change}: ${en.plan.parts.evening}` })
    ).toBeInTheDocument();
  });

  it("asks for alternatives and removals with the slot of the card", () => {
    const { onChange, onRemove } = renderDay();

    fireEvent.click(header());
    fireEvent.click(screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` }));
    expect(onChange).toHaveBeenCalledWith({ day: 2, part: "afternoon" });

    fireEvent.click(screen.getByRole("button", { name: `${p.remove}: ${BATHS.gellert.title}` }));
    expect(onRemove).toHaveBeenCalledWith({ day: 2, part: "afternoon" }, BATHS.gellert.id);
  });

  it("opens on mount when it is the first day", () => {
    renderDay({ defaultOpen: true });

    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  it("is open with nothing to toggle when it is the only day on screen", () => {
    renderDay({ static: true });

    // The summary is still there, but it is no longer a button.
    expect(screen.getByText(interpolate(p.day, { day: 2 }))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Day 2/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${p.change}: ${BATHS.gellert.title}` })
    ).toBeVisible();
  });
});
