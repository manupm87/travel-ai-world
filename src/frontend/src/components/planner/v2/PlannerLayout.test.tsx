import { describe, expect, it } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import en from "@/i18n/en";
import { PlannerLayout } from "./PlannerLayout";

const panes = {
  chat: <p>the chat</p>,
  panel: <p>the trip</p>,
  map: <p>the map</p>,
};

const tablist = () => screen.getByRole("tablist", { name: en.plan.title });
const tabNames = () =>
  within(tablist())
    .getAllByRole("tab")
    .map((tab) => tab.textContent);

describe("PlannerLayout", () => {
  it("offers the three panes as tabs when there is a map", () => {
    renderWithProviders(<PlannerLayout {...panes} />);

    expect(tabNames()).toEqual([en.plan.tabs.chat, en.plan.tabs.trip, en.plan.tabs.map]);
    expect(screen.getByText("the map")).toBeInTheDocument();
  });

  it("drops the Map tab, and the pane with it, on the trip overview", () => {
    renderWithProviders(<PlannerLayout {...panes} map={null} />);

    expect(tabNames()).toEqual([en.plan.tabs.chat, en.plan.tabs.trip]);
    expect(screen.queryByText("the map")).not.toBeInTheDocument();
    expect(screen.getByText("the trip")).toBeInTheDocument();
  });

  it("falls back to Trip when the map goes away under the active tab", () => {
    const { rerender } = renderWithProviders(<PlannerLayout {...panes} />);

    fireEvent.click(within(tablist()).getByRole("tab", { name: en.plan.tabs.map }));
    expect(
      within(tablist()).getByRole("tab", { name: en.plan.tabs.map })
    ).toHaveAttribute("aria-selected", "true");

    rerender(<PlannerLayout {...panes} map={null} />);

    const trip = within(tablist()).getByRole("tab", { name: en.plan.tabs.trip });
    expect(trip).toHaveAttribute("aria-selected", "true");
    expect(trip).toHaveAttribute("tabindex", "0");
  });

  it("skips the missing tab with the arrows, Home and End", () => {
    renderWithProviders(<PlannerLayout {...panes} map={null} />);

    const selected = () =>
      within(tablist())
        .getAllByRole("tab")
        .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;

    fireEvent.keyDown(tablist(), { key: "End" });
    expect(selected()).toBe(en.plan.tabs.trip);

    // Two tabs only: the next one round is Chat again, never Map.
    fireEvent.keyDown(tablist(), { key: "ArrowRight" });
    expect(selected()).toBe(en.plan.tabs.chat);

    fireEvent.keyDown(tablist(), { key: "ArrowLeft" });
    expect(selected()).toBe(en.plan.tabs.trip);

    fireEvent.keyDown(tablist(), { key: "Home" });
    expect(selected()).toBe(en.plan.tabs.chat);
  });
});
