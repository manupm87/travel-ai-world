import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@/services/http";
import { listCities } from "@/services/planner";
import { usePlannerCities } from "./usePlannerCities";

vi.mock("@/services/planner", () => ({
  listCities: vi.fn(),
}));

const listCitiesMock = vi.mocked(listCities);

const WIKIVOYAGE = "https://en.wikivoyage.org/wiki/Bologna";

const BOLOGNA = {
  slug: "bologna",
  name: "Bologna",
  centre: [44.4939, 11.3428] as [number, number],
  timezone: "Europe/Rome",
  intro: {
    en: { text: "Bologna is a historic city in Emilia-Romagna.", source_url: WIKIVOYAGE },
  },
  image_url: "https://commons.wikimedia.org/w/index.php?title=Special:FilePath/B.jpg",
  image_credit: "Someone (CC BY-SA 3.0) · Wikimedia Commons",
};

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
