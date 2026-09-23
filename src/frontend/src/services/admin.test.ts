import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_TRIP_PAGE, ADMIN_USER_PAGE, TRACE_STATS, TURN_DETAIL, TURN_PAGE } from "@/test/fixtures/admin";
import {
  getAdminTrip,
  getStats,
  getTurn,
  listAdminTrips,
  listAdminUsers,
  listSessionTurns,
  listTurns,
} from "./admin";
import { ApiError } from "./http";
import { clearSession, writeSession } from "./session";

const fetchMock = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** The path and query of the n-th request, without the base URL. */
function called(n = 0): { path: string; params: URLSearchParams; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  const parsed = new URL(url, "http://localhost");
  return { path: parsed.pathname, params: parsed.searchParams, init };
}

describe("services/admin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("reads the stats of a range from ai_api with the bearer token", async () => {
    fetchMock.mockResolvedValue(json(TRACE_STATS));

    await expect(getStats("2026-09-17", "2026-09-23")).resolves.toEqual(TRACE_STATS);

    const { path, params, init } = called();
    expect(path).toBe("/api/v1/ai/admin/stats");
    expect(Object.fromEntries(params)).toEqual({ start: "2026-09-17", end: "2026-09-23" });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("sends only the turn filters that are set, trip id and cursor included", async () => {
    fetchMock.mockImplementation(async () => json(TURN_PAGE));

    await listTurns({ day: "2026-09-23", kind: "planner", tripId: "t-1", city: undefined });
    expect(called().path).toBe("/api/v1/ai/admin/turns");
    expect(Object.fromEntries(called().params)).toEqual({
      day: "2026-09-23",
      kind: "planner",
      trip_id: "t-1",
    });

    await listTurns({ subject: "sub-1", status: "error", limit: 20 }, "CUR");
    expect(Object.fromEntries(called(1).params)).toEqual({
      subject: "sub-1",
      status: "error",
      cursor: "CUR",
      limit: "20",
    });
  });

  it("reads one turn, and answers null when there is none", async () => {
    fetchMock.mockResolvedValueOnce(json(TURN_DETAIL));
    await expect(getTurn("turn/1")).resolves.toEqual(TURN_DETAIL);
    expect(called().path).toBe("/api/v1/ai/admin/turns/turn%2F1");

    fetchMock.mockResolvedValueOnce(json({ detail: "missing" }, 404));
    await expect(getTurn("nope")).resolves.toBeNull();
  });

  it("rethrows anything that is not a 404", async () => {
    fetchMock.mockResolvedValue(json({ detail: "no" }, 403));
    await expect(getTurn("x")).rejects.toBeInstanceOf(ApiError);
  });

  it("reads a planner session's turns with a cursor", async () => {
    fetchMock.mockImplementation(async () => json(TURN_PAGE));
    await listSessionTurns("s-1", "C2");
    expect(called().path).toBe("/api/v1/ai/admin/sessions/s-1");
    expect(Object.fromEntries(called().params)).toEqual({ cursor: "C2" });
  });

  it("pages the accounts 200 at a time and the trips 50 at a time, from core_api", async () => {
    fetchMock.mockResolvedValueOnce(json(ADMIN_USER_PAGE));
    await expect(listAdminUsers()).resolves.toEqual(ADMIN_USER_PAGE);
    expect(called().path).toBe("/api/v1/admin/users");
    expect(Object.fromEntries(called().params)).toEqual({ limit: "200" });

    fetchMock.mockResolvedValueOnce(json(ADMIN_TRIP_PAGE));
    await listAdminTrips("NEXT");
    expect(called(1).path).toBe("/api/v1/admin/trips");
    expect(Object.fromEntries(called(1).params)).toEqual({ cursor: "NEXT", limit: "50" });
  });

  it("reads anyone's trip, and answers null when there is none", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "t" }));
    await getAdminTrip("u-1", "t-1");
    expect(called().path).toBe("/api/v1/admin/trips/u-1/t-1");

    fetchMock.mockResolvedValueOnce(json({ detail: "missing" }, 404));
    await expect(getAdminTrip("u-1", "t-2")).resolves.toBeNull();
  });
});
