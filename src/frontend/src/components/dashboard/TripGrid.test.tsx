import { describe, it, expect, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/test/render";
import { makeTripSummary } from "@/test/fixtures";
import en from "@/i18n/en";
import { TripGrid } from "./TripGrid";

const d = en.dashboard;

const trips = [
  makeTripSummary({ id: "old", title: "Prague Winter", status: "finished" }),
  makeTripSummary({ id: "draft", title: "Japan Draft", status: "planning" }),
  makeTripSummary({ id: "next", title: "Paris Escape", status: "planned" }),
];

function grid(leavingId: string | null = null) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const view = renderWithProviders(
    <TripGrid trips={trips} leavingId={leavingId} onEdit={onEdit} onDelete={onDelete} />
  );
  return { onEdit, onDelete, ...view };
}

describe("TripGrid", () => {
  it("reads upcoming first, then drafts, then history", () => {
    grid();

    const headings = [d.sections.planned, d.sections.planning, d.sections.finished].map(
      (name) => screen.getByRole("heading", { name })
    );
    expect(headings[0]!.compareDocumentPosition(headings[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(headings[1]!.compareDocumentPosition(headings[2]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    for (const title of ["Paris Escape", "Japan Draft", "Prague Winter"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("leaves out a group nobody has trips in", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderWithProviders(
      <TripGrid trips={[trips[2]!]} onEdit={onEdit} onDelete={onDelete} />
    );

    expect(screen.getByRole("heading", { name: d.sections.planned })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: d.sections.planning })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: d.sections.finished })
    ).not.toBeInTheDocument();
  });

  it("hands the whole trip to the card's two actions", () => {
    const { onEdit, onDelete } = grid();

    const menu = d.card.menu.replace("{title}", "Paris Escape");
    fireEvent.click(screen.getByRole("button", { name: menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: d.card.edit }));
    expect(onEdit).toHaveBeenCalledWith(trips[2]);

    fireEvent.click(screen.getByRole("button", { name: menu }));
    fireEvent.click(screen.getByRole("menuitem", { name: d.card.delete }));
    expect(onDelete).toHaveBeenCalledWith(trips[2]);
  });

  it("marks the card that is collapsing, and only that one", () => {
    const { container } = grid("draft");

    const leaving = container.querySelectorAll("[data-leaving]");
    expect(leaving).toHaveLength(1);
    expect(leaving[0]).toHaveTextContent("Japan Draft");
  });
});
