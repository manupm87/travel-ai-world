import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import EmptyDashboard from "./EmptyDashboard";
import en from "@/i18n/en";

describe("EmptyDashboard", () => {
  it("says what is missing and what to do about it", () => {
    renderWithProviders(<EmptyDashboard />);

    expect(screen.getByRole("heading", { name: en.dashboard.emptyTitle })).toBeInTheDocument();
    expect(screen.getByText(en.dashboard.emptyDescription)).toBeInTheDocument();
  });

  it("offers no second call to action: the field above is the one", () => {
    renderWithProviders(<EmptyDashboard />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
