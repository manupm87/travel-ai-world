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
const selected = () =>
  within(tablist())
    .getAllByRole("tab")
    .find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;

describe("PlannerLayout", () => {
  it("offers two panes as tabs: the chat and the trip", () => {
    renderWithProviders(<PlannerLayout {...panes} />);
    expect(tabNames()).toEqual([en.plan.tabs.chat, en.plan.tabs.trip]);
    expect(selected()).toBe(en.plan.tabs.chat);
  });

  it("puts the map behind the trip, in the trip's own pane", () => {
    renderWithProviders(<PlannerLayout {...panes} />);
    const trip = screen.getByRole("tabpanel", { name: en.plan.tabs.trip });
    expect(within(trip).getByText("the map")).toBeInTheDocument();
    expect(within(trip).getByText("the trip")).toBeInTheDocument();
    const chat = screen.getByRole("tabpanel", { name: en.plan.tabs.chat, hidden: true });
    expect(within(chat).queryByText("the map")).not.toBeInTheDocument();
  });

  it("grows the phone's sheet over the map and shrinks it back", () => {
    renderWithProviders(<PlannerLayout {...panes} />);
    const handle = screen.getByRole("button", { name: en.plan.sheet.expand });
    expect(handle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(handle);
    expect(screen.getByRole("button", { name: en.plan.sheet.collapse })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("has no sheet, and no map, when there is no map to float over", () => {
    renderWithProviders(<PlannerLayout {...panes} map={null} />);
    expect(screen.queryByText("the map")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.plan.sheet.expand })).not.toBeInTheDocument();
  });

  it("moves between the tabs with the arrows, Home and End", () => {
    renderWithProviders(<PlannerLayout {...panes} />);
    const list = tablist();

    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(selected()).toBe(en.plan.tabs.trip);
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(selected()).toBe(en.plan.tabs.chat);
    fireEvent.keyDown(list, { key: "End" });
    expect(selected()).toBe(en.plan.tabs.trip);
    fireEvent.keyDown(list, { key: "Home" });
    expect(selected()).toBe(en.plan.tabs.chat);
  });
});
