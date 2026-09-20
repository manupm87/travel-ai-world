import { describe, it, expect, vi } from "vitest";
import { fireEvent, renderWithProviders, screen, within } from "@/test/render";
import TripCard from "./TripCard";
import { makeTripSummary } from "@/test/fixtures";
import { TRIP_STATUSES, type TripSummary } from "@/types/trip-summary";
import en from "@/i18n/en";

const trip = makeTripSummary({
  id: "1",
  title: "Paris Adventure",
  destinations: ["Paris", "Versailles"],
  startDate: "2024-05-01",
  endDate: "2024-05-07",
  imageUrl: "/images/paris.jpg",
});

const c = en.dashboard.card;
const menuName = c.menu.replace("{title}", trip.title);

function withMenu(overrides: Partial<TripSummary> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const view = renderWithProviders(
    <TripCard trip={{ ...trip, ...overrides }} onEdit={onEdit} onDelete={onDelete} />
  );
  return { onEdit, onDelete, ...view };
}

describe("TripCard", () => {
  it("renders trip information", () => {
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.getByRole("heading", { name: "Paris Adventure" })).toBeInTheDocument();
    expect(screen.getByText("Paris, Versailles")).toBeInTheDocument();
    // The dates are formatted for the language, and the year is said once.
    expect(screen.getByText("May 1 – May 7, 2024")).toBeInTheDocument();
  });

  it("says nothing about dates a trip does not have", () => {
    renderWithProviders(<TripCard trip={{ ...trip, startDate: "", endDate: "" }} />);

    expect(screen.queryByText(/2024/)).not.toBeInTheDocument();
  });

  it("labels every status from the dictionary", () => {
    for (const status of TRIP_STATUSES) {
      const { unmount } = renderWithProviders(<TripCard trip={{ ...trip, status }} />);
      expect(screen.getByText(en.status[status])).toHaveAttribute("data-status", status);
      unmount();
    }
  });

  it("links to the trip viewer with the id in the query string", () => {
    renderWithProviders(<TripCard trip={trip} />);
    // next/link normalises the path here; `trailingSlash: true` adds the slash back at runtime.
    expect(screen.getByRole("link", { name: "Paris Adventure" })).toHaveAttribute(
      "href",
      "/trip?id=1"
    );
  });

  it("URL-encodes the id", () => {
    renderWithProviders(<TripCard trip={{ ...trip, id: "a b&c" }} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trip?id=a%20b%26c");
  });

  it("renders the cover as decoration, the title being the card's name", () => {
    const { container } = renderWithProviders(<TripCard trip={trip} />);
    const cover = container.querySelector("img");

    // next/image rewrites src through its loader, so match the underlying file.
    expect(cover).toHaveAttribute("src", expect.stringContaining("paris.jpg"));
    expect(cover).toHaveAttribute("alt", "");
  });

  it("falls back to a painted cover when the trip has no photo", () => {
    const { container } = renderWithProviders(<TripCard trip={{ ...trip, imageUrl: "" }} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Paris Adventure" })).toBeInTheDocument();
  });

  it("has no menu unless both actions are given", () => {
    renderWithProviders(<TripCard trip={trip} />);

    expect(screen.queryByRole("button", { name: menuName })).not.toBeInTheDocument();
  });

  it("opens the menu and calls the action that was chosen", () => {
    const { onEdit, onDelete } = withMenu();

    const button = screen.getByRole("button", { name: menuName });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);

    const menu = screen.getByRole("menu");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("menuitem", { name: c.edit })).toHaveFocus();

    fireEvent.click(within(menu).getByRole("menuitem", { name: c.edit }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("deletes through the menu", () => {
    const { onDelete } = withMenu();

    fireEvent.click(screen.getByRole("button", { name: menuName }));
    fireEvent.click(screen.getByRole("menuitem", { name: c.delete }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("moves between the items with the arrow keys", () => {
    withMenu();

    fireEvent.click(screen.getByRole("button", { name: menuName }));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });

    expect(within(menu).getByRole("menuitem", { name: c.delete })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(within(menu).getByRole("menuitem", { name: c.edit })).toHaveFocus();
  });

  it("closes on Escape and gives the focus back to the button", () => {
    withMenu();

    const button = screen.getByRole("button", { name: menuName });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("opens from the keyboard with ArrowDown on the button", () => {
    withMenu();

    fireEvent.keyDown(screen.getByRole("button", { name: menuName }), { key: "ArrowDown" });

    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
