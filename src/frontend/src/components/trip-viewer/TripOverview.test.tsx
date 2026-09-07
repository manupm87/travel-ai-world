import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import TripOverview from "./TripOverview";
import { makeAccommodation, makeTransportation, makeTrip } from "@/test/fixtures";
import en from "@/i18n/en";

const trip = makeTrip({
  accommodation: [makeAccommodation({ name: "Le Cinema Hotel", rating: 4.5, city: "Cannes" })],
  transportation: [
    makeTransportation({
      fromCity: "Nice",
      toCity: "Cannes",
      type: "train",
      provider: "SNCF",
      departureTime: "10:00",
      arrivalTime: "10:30",
      duration: 30,
    }),
  ],
});

describe("TripOverview", () => {
  it("renders accommodation details", () => {
    renderWithProviders(<TripOverview trip={trip} />);

    expect(screen.getByRole("heading", { name: en.tripViewer.accommodations })).toBeInTheDocument();
    expect(screen.getByText("Le Cinema Hotel")).toBeInTheDocument();
    expect(screen.getByText("4.5 ★")).toBeInTheDocument();
    expect(screen.getByText("Cannes, FR")).toBeInTheDocument();
  });

  it("renders transportation details", () => {
    renderWithProviders(<TripOverview trip={trip} />);

    expect(screen.getByRole("heading", { name: en.tripViewer.transportation })).toBeInTheDocument();
    expect(screen.getByText("Nice → Cannes")).toBeInTheDocument();
    expect(screen.getByText("train")).toBeInTheDocument();
    expect(screen.getByText(/SNCF/)).toBeInTheDocument();
    expect(screen.getByText("10:00 - 10:30 (30m)")).toBeInTheDocument();
  });
});
