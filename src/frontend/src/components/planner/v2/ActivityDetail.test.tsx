import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { ACTIVITIES, HOTELS } from "@/data/planner-demo/session";
import type { CardDetail } from "@/types/planner";
import { ActivityDetail } from "./ActivityDetail";

const p = en.plan.panel;
const d = en.plan.detail;
const card = ACTIVITIES.greatMarket;

const DETAIL: CardDetail = {
  ...card,
  // The endpoint knows nothing of the turn that wrote `why`, and answers with
  // the corpus's own photo — here, none at all.
  why: "",
  image_url: null,
  image_credit: null,
  description: "A three-storey market hall of 1897.\n\nUpstairs: lángos. Downstairs: paprika.",
  heading_path: "Budapest/Ferencváros > Do",
  address: "Vámház körút 1–3, 1093 Budapest",
  phone: "+36 1 366 3300",
  website: "https://piaconline.hu/",
};

function renderDetail(overrides: Partial<ComponentProps<typeof ActivityDetail>> = {}) {
  const props = {
    card,
    slot: { day: 1, part: "morning" as const },
    detail: null,
    status: "unavailable" as const,
    onBack: vi.fn(),
    onChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<ActivityDetail {...props} />);
  return props;
}

describe("ActivityDetail", () => {
  it("shows what the card carries, with no detail at all", () => {
    renderDetail();

    expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
    expect(screen.getByText(card.why)).toBeInTheDocument();
    expect(screen.getByText(card.district!)).toBeInTheDocument();
    expect(screen.getByText(card.hours!)).toBeInTheDocument();
    expect(screen.getByText(d.categories.buy!)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: card.title })).toHaveAttribute("src", card.image_url);
    expect(
      screen.getByRole("link", { name: interpolate(en.plan.card.source, { source: card.source }) })
    ).toHaveAttribute("href", card.source_url);

    // Nothing says that the detail could not be had.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("draws a busy skeleton while the detail is on its way", () => {
    renderDetail({ status: "loading" });

    const skeleton = screen.getByRole("status", { name: d.loading });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { level: 3, name: card.title })).toBeInTheDocument();
  });

  it("adds the article, the address, the phone and the site when the detail is ready", () => {
    renderDetail({ detail: DETAIL, status: "ready" });

    expect(screen.getByText("A three-storey market hall of 1897.")).toBeInTheDocument();
    expect(screen.getByText("Upstairs: lángos. Downstairs: paprika.")).toBeInTheDocument();
    expect(screen.getByText(DETAIL.address!)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: DETAIL.phone! })).toHaveAttribute(
      "href",
      "tel:+3613663300"
    );
    const site = screen.getByRole("link", { name: DETAIL.website! });
    expect(site).toHaveAttribute("href", DETAIL.website);
    expect(site).toHaveAttribute("rel", expect.stringContaining("noopener"));

    // The card's own photo and the model's `why` survive the merge.
    expect(screen.getByRole("img", { name: card.title })).toHaveAttribute("src", card.image_url);
    expect(screen.getByText(card.why)).toBeInTheDocument();
  });

  it("links to Google Maps directions only when the card has coordinates", () => {
    renderDetail();

    expect(screen.getByRole("link", { name: d.directions })).toHaveAttribute(
      "href",
      `https://www.google.com/maps/dir/?api=1&destination=${card.lat},${card.lon}`
    );
  });

  it("has no directions link without coordinates", () => {
    renderDetail({ card: { ...card, lat: null, lon: null } });

    expect(screen.queryByRole("link", { name: d.directions })).not.toBeInTheDocument();
  });

  it("goes back from the button and from Escape", () => {
    const { onBack } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: interpolate(d.backToDay, { day: 1 }) }));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("forwards Change and Remove with the card's slot", () => {
    const { onChange, onRemove } = renderDetail();

    fireEvent.click(screen.getByRole("button", { name: `${p.change}: ${card.title}` }));
    expect(onChange).toHaveBeenCalledWith({ day: 1, part: "morning" });

    fireEvent.click(screen.getByRole("button", { name: `${p.remove}: ${card.title}` }));
    expect(onRemove).toHaveBeenCalledWith({ day: 1, part: "morning" }, card.id);
  });

  it("says the stay belongs to no day, and offers no way to remove it", () => {
    renderDetail({ card: HOTELS.rum, slot: { day: 0, part: null } });

    expect(screen.getByRole("button", { name: d.backToStay })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: `${p.remove}: ${HOTELS.rum.title}` })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${p.change}: ${HOTELS.rum.title}` })
    ).toBeInTheDocument();
  });
});
