import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import TripCard from "./TripCard";
import { makeTripSummary } from "@/test/fixtures";
import { TRIP_STATUSES } from "@/types/trip-summary";
import en from "@/i18n/en";

const trip = makeTripSummary({
  id: "1",
  title: "Paris Adventure",
  destinations: ["Paris", "Versailles"],
  startDate: "2024-05-01",
  endDate: "2024-05-07",
  imageUrl: "/images/paris.jpg",
});

describe("TripCard", () => {
  it("renders trip information", () => {
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("heading", { name: "Paris Adventure" })).toBeInTheDocument();
    expect(screen.getByText("Paris, Versailles")).toBeInTheDocument();
    expect(screen.getByText("2024-05-01 - 2024-05-07")).toBeInTheDocument();
  });

  it("labels every status from the dictionary", () => {
    for (const status of TRIP_STATUSES) {
      const { unmount } = renderWithProviders(<TripCard trip={{ ...trip, status }} />);
      expect(screen.getByText(en.status[status])).toHaveAttribute("data-status", status);
      unmount();
    }
  });

  it("links to the trip page", () => {
    renderWithProviders(<TripCard trip={trip} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trip/1");
  });

  it("renders the cover image with the title as alt text", () => {
    renderWithProviders(<TripCard trip={trip} />);
    // next/image rewrites src through its loader, so match the underlying file
    expect(screen.getByAltText("Paris Adventure")).toHaveAttribute(
      "src",
      expect.stringContaining("paris.jpg")
    );
  });
});
