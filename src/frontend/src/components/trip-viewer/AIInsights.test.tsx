import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import AIInsights from "./AIInsights";
import { makeTrip } from "@/test/fixtures";
import en from "@/i18n/en";

const tv = en.tripViewer;

describe("AIInsights", () => {
  it("renders weather and local tips", () => {
    renderWithProviders(
      <AIInsights
        trip={makeTrip({
          aiInsights: { weatherForecast: "Sunny and warm.", localTips: ["Carry water", "Use sunscreen"] },
        })}
      />
    );

    expect(screen.getByRole("heading", { name: tv.weatherForecast })).toBeInTheDocument();
    expect(screen.getByText("Sunny and warm.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: tv.localTips })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Carry water",
      "Use sunscreen",
    ]);
  });

  it("renders translated fallbacks when insights are missing", () => {
    renderWithProviders(<AIInsights trip={makeTrip({ aiInsights: undefined })} />);
    expect(screen.getByText(tv.weatherUnavailable)).toBeInTheDocument();
    expect(screen.getByText(tv.noLocalTips)).toBeInTheDocument();
  });

  it("renders a single-string tip as a paragraph", () => {
    renderWithProviders(
      <AIInsights trip={makeTrip({ aiInsights: { weatherForecast: "Rainy", localTips: "Just one tip." } })} />
    );
    expect(screen.getByText("Just one tip.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
