import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { TripSection } from "./TripSection";
import { makeTripSummary } from "@/test/fixtures";

const trips = [
  makeTripSummary({ id: "1", title: "Trip 1" }),
  makeTripSummary({ id: "2", title: "Trip 2", status: "planning" }),
];

describe("TripSection", () => {
  it("renders the label and one card per trip", () => {
    renderWithProviders(<TripSection title="My Trips" trips={trips} />);

    expect(screen.getByText("My Trips")).toBeInTheDocument();
    const cards = screen.getAllByRole("link");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Trip 1");
    expect(cards[0]).toHaveAttribute("href", "/trip/1");
    expect(cards[1]).toHaveTextContent("Trip 2");
  });

  it("renders nothing when there are no trips", () => {
    const { container } = renderWithProviders(<TripSection title="No Trips" trips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
