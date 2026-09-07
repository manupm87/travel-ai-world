import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import EmptyDashboard from "./EmptyDashboard";
import en from "@/i18n/en";

describe("EmptyDashboard", () => {
  it("renders the translated empty state", () => {
    renderWithProviders(<EmptyDashboard />);
    expect(screen.getByRole("heading", { name: en.dashboard.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.emptyDescription)).toBeInTheDocument();
  });

  it("links to the planner", () => {
    renderWithProviders(<EmptyDashboard />);
    expect(screen.getByRole("link", { name: new RegExp(en.planner.label) })).toHaveAttribute(
      "href",
      "#planner"
    );
  });
});
