import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import es from "@/i18n/es";
import { interpolate } from "@/i18n";
import { useLanguage } from "@/context/LanguageContext";
import { EMPTY_ITINERARY, applyItineraryOps } from "@/hooks/plannerReducer";
import {
  ACTIVITIES,
  BRIEF_COMPLETE,
  EXTRAS,
  FIRST_ITINERARY_OPS,
  HOTELS,
  commonsPhoto,
} from "@/data/planner-demo/session";
import type { ItineraryOp, PlannerCity } from "@/types/planner";
import { TripOverview } from "./TripOverview";

const p = en.plan.panel;
const itinerary = applyItineraryOps(EMPTY_ITINERARY, FIRST_ITINERARY_OPS);

const WIKIVOYAGE = "https://en.wikivoyage.org/wiki/Budapest";
const CITY_PHOTO = commonsPhoto("Budapest_hero.jpg");

const BUDAPEST: PlannerCity = {
  slug: "budapest",
  name: "Budapest",
  country: "Hungary",
  country_code: "HU",
  centre: [47.4979, 19.0402],
  timezone: "Europe/Budapest",
  intro: {
    en: {
      text: "Budapest is the capital of Hungary.\n\nThe Danube splits it in two.",
      source_url: WIKIVOYAGE,
    },
    es: {
      text: "Budapest es la capital de Hungría.",
      source_url: "https://es.wikivoyage.org/wiki/Budapest",
    },
  },
  image_url: CITY_PHOTO,
  image_credit: "A photographer (CC BY-SA 4.0) · Wikimedia Commons",
};

function renderOverview(
  city: PlannerCity | null = BUDAPEST,
  draft = itinerary,
  language: "en" | "es" = "en"
) {
  const onSelectDay = vi.fn();

  function SwitchLanguage() {
    const { setLanguage } = useLanguage();
    return (
      <button type="button" onClick={() => setLanguage(language)}>
        switch
      </button>
    );
  }

  renderWithProviders(
    <>
      <SwitchLanguage />
      <TripOverview
        itinerary={draft}
        brief={BRIEF_COMPLETE}
        city={city}
        onSelectDay={onSelectDay}
      />
    </>
  );
  if (language !== "en") fireEvent.click(screen.getByRole("button", { name: "switch" }));
  return { onSelectDay };
}

/** The mosaic's photos, in the order they are rendered. */
const mosaicSources = () =>
  within(screen.getByRole("list", { name: interpolate(p.photos, { destination: "Budapest" }) }))
    .getAllByRole("img")
    .map((img) => img.getAttribute("src"));

const dayRows = () =>
  within(screen.getByRole("list", { name: p.dayList })).getAllByRole("button");

/** The photo at the top; `alt=""` keeps it out of the accessibility tree. */
const hero = () => document.querySelector("[data-trip-hero]");

describe("TripOverview", () => {
  it("leads with the city's own photo and its credit", () => {
    renderOverview();

    expect(hero()).toHaveAttribute("src", CITY_PHOTO);
    expect(hero()).toHaveAttribute("alt", "");
    expect(
      screen.getByText(
        interpolate(en.plan.card.imageCredit, { credit: BUDAPEST.image_credit ?? "" })
      )
    ).toBeInTheDocument();
  });

  it("describes the destination in English, credited to the page it comes from", () => {
    renderOverview();

    expect(
      screen.getByRole("heading", { name: interpolate(p.about, { destination: "Budapest" }) })
    ).toBeInTheDocument();
    // One paragraph per blank-line-separated block.
    expect(screen.getByText("Budapest is the capital of Hungary.")).toBeInTheDocument();
    expect(screen.getByText("The Danube splits it in two.")).toBeInTheDocument();

    const credit = screen.getByRole("link", { name: p.introCredit });
    expect(credit).toHaveAttribute("href", WIKIVOYAGE);
    expect(credit).toHaveAttribute("target", "_blank");
    expect(credit).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("describes it in Spanish when that is the reader's language", () => {
    renderOverview(BUDAPEST, itinerary, "es");

    expect(screen.getByText("Budapest es la capital de Hungría.")).toBeInTheDocument();
    expect(screen.queryByText("Budapest is the capital of Hungary.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: es.plan.panel.introCredit })
    ).toHaveAttribute("href", "https://es.wikivoyage.org/wiki/Budapest");
  });

  it("falls back to the English intro when the reader's language has none", () => {
    renderOverview(
      { ...BUDAPEST, intro: { en: BUDAPEST.intro.en! } },
      itinerary,
      "es"
    );

    expect(screen.getByText("Budapest is the capital of Hungary.")).toBeInTheDocument();
  });

  it("without a city, leads with the trip's first photo and says nothing about the destination", () => {
    renderOverview(null);

    expect(hero()).toHaveAttribute("src", HOTELS.rum.image_url ?? "");
    expect(
      screen.queryByRole("heading", { name: interpolate(p.about, { destination: "Budapest" }) })
    ).not.toBeInTheDocument();
    // The photo that became the hero is not in the mosaic as well.
    expect(mosaicSources()).not.toContain(HOTELS.rum.image_url);
  });

  it("shows at most six photos of the trip, the hero excluded", () => {
    renderOverview();

    const sources = mosaicSources();
    expect(sources).toHaveLength(6);
    expect(sources).not.toContain(CITY_PHOTO);
    // Itinerary order: the stay first, then day 1 from the morning on.
    expect(sources[0]).toBe(HOTELS.rum.image_url);
    expect(sources[1]).toBe(ACTIVITIES.greatMarket.image_url);
  });

  it("never shows the same photo twice", () => {
    // Day 1's afternoon reusing the morning's photo: one picture, not two.
    const patched = applyItineraryOps(itinerary, [
      {
        op: "put_activity",
        slot: { day: 1, part: "afternoon" },
        card: { ...EXTRAS.basilica, image_url: ACTIVITIES.greatMarket.image_url },
      },
    ] satisfies ItineraryOp[]);

    renderOverview(BUDAPEST, patched);

    const sources = mosaicSources();
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.filter((src) => src === ACTIVITIES.greatMarket.image_url)).toHaveLength(1);
  });

  it("lists every day with its date, title and how many experiences", () => {
    renderOverview();

    const rows = dayRows();
    expect(rows).toHaveLength(3);

    // The row is named by everything it shows, with "Open day 1" read first:
    // an `aria-label` would have hidden the title, the date and the count.
    expect(rows[0]).toHaveAccessibleName(
      new RegExp(`^${interpolate(p.openDay, { day: 1 })}`)
    );
    expect(rows[0]).toHaveAccessibleName(/Arrival: Belváros and the Danube/);
    expect(rows[0]).toHaveAccessibleName(/4 experiences/);
    expect(rows[0]).toHaveTextContent("Arrival: Belváros and the Danube");
    expect(rows[0]).toHaveTextContent("Fri, Oct 23");
    expect(rows[0]).toHaveTextContent(interpolate(p.experiences, { count: 4 }));

    expect(rows[1]).toHaveTextContent("Sat, Oct 24");
    expect(rows[1]).toHaveTextContent("Sunny");
    expect(rows[1]).toHaveTextContent("13 °C");
    expect(rows[2]).toHaveAccessibleName(
      new RegExp(`^${interpolate(p.openDay, { day: 3 })}`)
    );
  });

  it("shows a day's warnings under its row", () => {
    renderOverview();

    // The recorded session warns about day 2's afternoon.
    expect(screen.getByText("40 minutes on foot from the previous stop")).toBeInTheDocument();
  });

  it("opens the day that is clicked", () => {
    const { onSelectDay } = renderOverview();

    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(interpolate(p.openDay, { day: 2 })) })
    );

    expect(onSelectDay).toHaveBeenCalledWith(2);
  });
});
