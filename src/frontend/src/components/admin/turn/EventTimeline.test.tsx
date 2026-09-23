import { describe, expect, it } from "vitest";
import { CHAT_TURN, INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import { renderWithProviders, screen } from "@/test/render";
import { EventTimeline } from "./EventTimeline";

describe("EventTimeline", () => {
  it("counts the events in its header and lists them with the end of the stream", () => {
    renderWithProviders(<EventTimeline turn={INSPECTOR_TURN} />);
    expect(screen.getByTestId("events-count")).toHaveTextContent("12 events");
    const rows = screen.getAllByRole("row");
    // 12 marks + the end row + the (visually hidden) header row.
    expect(rows).toHaveLength(14);
    const end = rows[rows.length - 1]!;
    expect(end).toHaveTextContent("11.20");
    expect(end).toHaveTextContent("[DONE]");
    expect(end).toHaveTextContent("end of the stream");
  });

  it("shows seconds with two decimals", () => {
    renderWithProviders(<EventTimeline turn={INSPECTOR_TURN} />);
    expect(screen.getByText("0.13")).toBeInTheDocument();
    expect(screen.getByText("10.74")).toBeInTheDocument();
  });

  it("collapsed text marks read as a count of deltas", () => {
    renderWithProviders(<EventTimeline turn={INSPECTOR_TURN} />);
    expect(screen.getByText("3 deltas")).toBeInTheDocument();
    expect(screen.getByText("2 deltas")).toBeInTheDocument();
    renderWithProviders(<EventTimeline turn={CHAT_TURN} />);
    expect(screen.getByText("20 deltas")).toBeInTheDocument();
  });

  it("a mark that warns carries a Warning pill", () => {
    renderWithProviders(<EventTimeline turn={INSPECTOR_TURN} />);
    expect(screen.getAllByText("Warning")).toHaveLength(1);
  });
});
