/** Unit tests for the itinerary's date helpers. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { dateForDay, daysBetween, parseIsoDate, todayIso, tomorrowIso } from "./tripDates";

describe("parseIsoDate", () => {
  it("reads a date as UTC midnight", () => {
    expect(parseIsoDate("2026-10-25")).toBe(Date.UTC(2026, 9, 25));
    expect(parseIsoDate("2028-02-29")).toBe(Date.UTC(2028, 1, 29));
  });

  it("rejects another format", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-1-05")).toBeNull();
    expect(parseIsoDate("25/10/2026")).toBeNull();
    expect(parseIsoDate("2026-10-25T00:00:00Z")).toBeNull();
  });

  it("rejects a day the calendar does not have", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-04-31")).toBeNull();
    expect(parseIsoDate("2026-10-00")).toBeNull();
  });
});

describe("dateForDay", () => {
  it("counts days from the start, the first day being the start", () => {
    expect(dateForDay("2026-10-25", 1)).toBe("2026-10-25");
    expect(dateForDay("2026-10-25", 3)).toBe("2026-10-27");
  });

  it("crosses a month and a year end", () => {
    expect(dateForDay("2026-10-31", 2)).toBe("2026-11-01");
    expect(dateForDay("2026-12-31", 2)).toBe("2027-01-01");
  });

  it("answers null without a valid start", () => {
    expect(dateForDay(null, 1)).toBeNull();
    expect(dateForDay("2026-02-30", 1)).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts both ends", () => {
    expect(daysBetween("2026-10-25", "2026-10-25")).toBe(1);
    expect(daysBetween("2026-10-25", "2026-10-27")).toBe(3);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(4);
  });

  it("answers null when an end is missing, malformed or before the start", () => {
    expect(daysBetween(null, "2026-10-27")).toBeNull();
    expect(daysBetween("2026-10-25", null)).toBeNull();
    expect(daysBetween("2026-10-27", "2026-10-25")).toBeNull();
    expect(daysBetween("2026-10-25", "2026-02-31")).toBeNull();
  });
});

describe("todayIso and tomorrowIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("read the reader's calendar across a year end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30));

    expect(todayIso()).toBe("2026-12-31");
    expect(tomorrowIso()).toBe("2027-01-01");
  });

  it("cross a month end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 28, 9, 0));

    expect(tomorrowIso()).toBe("2026-03-01");
  });
});
