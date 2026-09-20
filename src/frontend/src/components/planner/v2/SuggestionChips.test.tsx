import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import type { PlannerCity } from "@/types/planner";
import { SuggestionChips } from "./SuggestionChips";

/** The trip overview's fields (TRA-182); the chips use none of them. */
const NO_OVERVIEW = { intro: {}, image_url: null, image_credit: null };

const CITIES: PlannerCity[] = [
  {
    slug: "budapest",
    name: "Budapest",
    country: "Hungary",
    country_code: "HU",
    centre: [47.4979, 19.0402],
    timezone: "Europe/Budapest",
    ...NO_OVERVIEW,
  },
  {
    slug: "bologna",
    name: "Bologna",
    country: "Italy",
    country_code: "IT",
    centre: [44.4939, 11.3428],
    timezone: "Europe/Rome",
    ...NO_OVERVIEW,
  },
];

const starter = (city: string) => interpolate(en.plan.cityStarter, { city });

describe("SuggestionChips", () => {
  it("offers one starter per covered city before the shortcuts, and sends it as typed", () => {
    const onPick = vi.fn();
    renderWithProviders(<SuggestionChips onPick={onPick} cities={CITIES} showStarters />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual([starter("Budapest"), starter("Bologna"), ...en.plan.suggestions]);

    fireEvent.click(screen.getByRole("button", { name: starter("Bologna") }));
    expect(onPick).toHaveBeenCalledWith(starter("Bologna"));
  });

  it("keeps only the shortcuts once the conversation has begun", () => {
    renderWithProviders(<SuggestionChips onPick={vi.fn()} cities={CITIES} showStarters={false} />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(en.plan.suggestions);
  });

  it("falls back to the shortcuts alone when no city is known yet", () => {
    renderWithProviders(<SuggestionChips onPick={vi.fn()} showStarters />);

    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(en.plan.suggestions);
  });

  it("is one scrolling row below lg and a wrapping cloud above it (TRA-187)", () => {
    renderWithProviders(<SuggestionChips onPick={vi.fn()} />);

    const row = screen.getAllByRole("button")[0]?.parentElement;
    expect(row?.className).toContain("overflow-x-auto");
    expect(row?.className).toContain("lg:flex-wrap");
    expect(row?.className).toContain("lg:overflow-visible");
    // A chip that shrank or wrapped its label would defeat the row.
    expect(screen.getAllByRole("button")[0]?.className).toContain("shrink-0");
    expect(screen.getAllByRole("button")[0]?.className).toContain("whitespace-nowrap");
  });
});
