import { describe, it, expect } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import InteractiveTimeline from "./InteractiveTimeline";
import { makeDestination, makeTrip } from "@/test/fixtures";
import en from "@/i18n/en";

const trip = makeTrip({
  destinations: [
    makeDestination({ id: "d1", city: "Paris", nightsStaying: 3 }),
    makeDestination({ id: "d2", city: "Lyon", nightsStaying: 2 }),
  ],
});

describe("InteractiveTimeline", () => {
  it("renders every destination and opens the first one", () => {
    renderWithProviders(<InteractiveTimeline trip={trip} />);

    expect(screen.getByRole("heading", { name: en.tripViewer.routeOverview })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paris" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lyon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Paris" })).toBeInTheDocument();
  });

  it("switches the active destination on click", () => {
    renderWithProviders(<InteractiveTimeline trip={trip} />);

    fireEvent.click(screen.getByRole("button", { name: "Lyon" }));

    expect(screen.getByRole("heading", { level: 4, name: "Lyon" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4, name: "Paris" })).not.toBeInTheDocument();
  });

  it("offers to jump to the itinerary", () => {
    renderWithProviders(<InteractiveTimeline trip={trip} />);
    expect(screen.getByRole("button", { name: en.tripViewer.viewItinerary })).toBeInTheDocument();
  });
});
