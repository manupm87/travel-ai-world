import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { getAdminTrip } from "@/services/admin";
import { ApiError } from "@/services/http";
import BUDAPEST, { TRIP_ID } from "@/test/fixtures/trip-budapest";
import { useAdminTrip } from "./useAdminTrip";

vi.mock("@/services/admin", () => ({
  getAdminTrip: vi.fn(),
}));

const getAdminTripMock = vi.mocked(getAdminTrip);
const USER = BUDAPEST.user_id;

describe("useAdminTrip", () => {
  beforeEach(() => {
    getAdminTripMock.mockReset();
  });

  it("loads the trip and rebuilds the planner's draft from it", async () => {
    getAdminTripMock.mockResolvedValue(BUDAPEST);
    const { result } = renderHook(() => useAdminTrip(USER, TRIP_ID));

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getAdminTripMock).toHaveBeenCalledWith(USER, TRIP_ID, expect.anything());
    if (result.current.status !== "ready") throw new Error("not ready");
    const { dto, trip, draft } = result.current.data;
    expect(dto).toBe(BUDAPEST);
    expect(trip.city.slug).toBe("budapest");
    expect(draft.itinerary.days).toHaveLength(3);
    expect(draft.itinerary.stay?.title).toBe(BUDAPEST.accommodations[0]!.name);
  });

  it("is not-found when the API answers 404 (null)", async () => {
    getAdminTripMock.mockResolvedValue(null);
    const { result } = renderHook(() => useAdminTrip(USER, TRIP_ID));
    await waitFor(() => expect(result.current.status).toBe("not-found"));
  });

  it("is an error the page can retry", async () => {
    getAdminTripMock.mockRejectedValueOnce(new ApiError(500, "boom"));
    const { result } = renderHook(() => useAdminTrip(USER, TRIP_ID));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.status === "error" && result.current.error).toBe("failed");

    getAdminTripMock.mockResolvedValueOnce(BUDAPEST);
    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("says forbidden on a 403", async () => {
    getAdminTripMock.mockRejectedValue(new ApiError(403, "no"));
    const { result } = renderHook(() => useAdminTrip(USER, TRIP_ID));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.status === "error" && result.current.error).toBe("forbidden");
  });

  it.each([
    ["a malformed id", USER, "not-a-uuid"],
    ["a missing id", USER, null],
    ["a missing user", null, TRIP_ID],
  ])("is not-found without a request for %s", (_label, user, id) => {
    const { result } = renderHook(() => useAdminTrip(user, id));
    expect(result.current.status).toBe("not-found");
    expect(getAdminTripMock).not.toHaveBeenCalled();
  });
});
