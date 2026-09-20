import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { HOTELS } from "@/data/planner-demo/session";
import { StayCard } from "./StayCard";

const stay = HOTELS.rum;

describe("StayCard", () => {
  it("counts one night in the singular", () => {
    renderWithProviders(<StayCard stay={stay} nights={1} />);
    expect(screen.getByText(en.plan.panel.stayOne)).toBeInTheDocument();
  });

  it("counts several nights in the plural", () => {
    renderWithProviders(<StayCard stay={stay} nights={3} />);
    expect(screen.getByText(interpolate(en.plan.panel.stay, { nights: 3 }))).toBeInTheDocument();
  });

  it("says only 'Stay' while the brief has no dates", () => {
    renderWithProviders(<StayCard stay={stay} nights={null} />);
    expect(screen.getByText(en.plan.panel.stayNoNights)).toBeInTheDocument();
  });
});
