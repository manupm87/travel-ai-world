import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/http";
import { listCities } from "@/services/planner";
import { BOLOGNA, BUDAPEST } from "@/test/fixtures/planner-city";
import { findCity, usePlannerCities } from "./usePlannerCities";

vi.mock("@/services/planner", () => ({
  listCities: vi.fn(),
}));

const listCitiesMock = vi.mocked(listCities);

describe("usePlannerCities", () => {
  beforeEach(() => {
    listCitiesMock.mockReset();
  });

  it("loads the cities once and reports them", async () => {
    listCitiesMock.mockResolvedValue([BOLOGNA]);

    const { result } = renderHook(() => usePlannerCities());

    expect(result.current).toEqual({ cities: [], status: "loading" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.cities).toEqual([BOLOGNA]);
    expect(listCitiesMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an empty list when the call fails, so the page shows its default copy", async () => {
    listCitiesMock.mockRejectedValue(new ApiError(503, "down"));

    const { result } = renderHook(() => usePlannerCities());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.cities).toEqual([]);
  });
});

const CITIES = [BOLOGNA, BUDAPEST];

describe("findCity", () => {
  it("matches the name or the slug exactly", () => {
    expect(findCity(CITIES, "Budapest")).toBe(BUDAPEST);
    expect(findCity(CITIES, "budapest")).toBe(BUDAPEST);
    // ai_api never trims what the traveller typed
    expect(findCity(CITIES, "budapest ")).toBe(BUDAPEST);
    expect(findCity(CITIES, "bologna")).toBe(BOLOGNA);
  });

  it("matches a city named inside the destination, as the backend does", () => {
    // `resolve_city` matches an alias inside the text and leaves the destination as it came
    expect(findCity(CITIES, "Budapest, Hungary")).toBe(BUDAPEST);
    expect(findCity(CITIES, "Trip to Budapest")).toBe(BUDAPEST);
  });

  it("ignores accents on either side", () => {
    expect(findCity(CITIES, "BUDAPEST")).toBe(BUDAPEST);
    expect(findCity([{ ...BOLOGNA, name: "Bologna" }], "bolognà")).not.toBeNull();
  });

  it("only matches whole words", () => {
    expect(findCity(CITIES, "Budapesti")).toBeNull();
    expect(findCity(CITIES, "Bolognese sauce")).toBeNull();
  });

  it("answers null without a destination or without a match", () => {
    expect(findCity(CITIES, null)).toBeNull();
    expect(findCity(CITIES, undefined)).toBeNull();
    expect(findCity(CITIES, "   ")).toBeNull();
    expect(findCity(CITIES, "Lisbon")).toBeNull();
    expect(findCity([], "Budapest")).toBeNull();
  });

  it("prefers the city the destination names exactly", () => {
    const york = { ...BOLOGNA, slug: "york", name: "York" };
    const newYork = { ...BOLOGNA, slug: "new-york", name: "New York" };

    expect(findCity([newYork, york], "York")).toBe(york);
  });
});
