import { describe, it, expect } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import Itinerary from "./Itinerary";
import { DayCard } from "./DayCard";
import { makeDestination, makeItineraryDay, makeTrip } from "@/test/fixtures";
import en from "@/i18n/en";

const trip = makeTrip({
  destinations: [
    makeDestination({ id: "dest-1", city: "Paris" }),
    makeDestination({ id: "dest-2", city: "London", countryCode: "GB" }),
  ],
  dates: { startDate: "2026-05-15", endDate: "2026-05-20", durationDays: 5 },
  itinerary: [
    makeItineraryDay({ dayNumber: 1, destinationId: "dest-1", title: "Paris Day 1" }),
    makeItineraryDay({ dayNumber: 2, destinationId: "dest-1", title: "Paris Day 2" }),
    makeItineraryDay({ dayNumber: 3, destinationId: "dest-2", title: "London Day 1" }),
  ],
});

describe("Itinerary", () => {
  it("renders the interpolated journey title and all days by default", () => {
    renderWithProviders(<Itinerary trip={trip} />);
    expect(screen.getByRole("heading", { name: "Your 5-Day Journey" })).toBeInTheDocument();
    expect(screen.getByText("Paris Day 1")).toBeInTheDocument();
    expect(screen.getByText("Paris Day 2")).toBeInTheDocument();
    expect(screen.getByText("London Day 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.tripViewer.allDays })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("filters by destination", () => {
    renderWithProviders(<Itinerary trip={trip} />);

    fireEvent.click(screen.getByRole("button", { name: "Paris" }));

    expect(screen.getByText("Paris Day 1")).toBeInTheDocument();
    expect(screen.getByText("Paris Day 2")).toBeInTheDocument();
    expect(screen.queryByText("London Day 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paris" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DayCard", () => {
  const day = makeItineraryDay({
    title: "Free Day in Paris",
    description: "Enjoy a free day walking around the city.",
    estimatedCost: 50,
  });

  it("toggles the description when clicked", () => {
    renderWithProviders(<DayCard day={day} currency="EUR" />);

    expect(screen.queryByText(day.description)).not.toBeInTheDocument();

    const header = screen.getByRole("button");
    fireEvent.click(header);
    expect(screen.getByText(day.description)).toBeInTheDocument();

    fireEvent.click(header);
    expect(screen.queryByText(day.description)).not.toBeInTheDocument();
  });

  it("badges a free day", () => {
    renderWithProviders(<DayCard day={day} currency="EUR" />);
    expect(screen.getByText(en.tripViewer.freeDay)).toBeInTheDocument();
  });
});
