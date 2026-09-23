import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, UnauthorizedError } from "@/services/http";
import { readToken, writeSession } from "@/services/session";
import { getTrip } from "@/services/trips";
import { makeTrip } from "@/test/fixtures";
import { isTripId, useTrip } from "./useTrip";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/trips", () => ({
  getTrip: vi.fn(),
}));

const getTripMock = vi.mocked(getTrip);

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OTHER_ID = "9b2e5d1c-7a41-4c3e-8f0d-1234567890ab";

const auth = (isAuthenticated: boolean) =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated,
    isLoading: false,
    user: null,
    provider: "google" as const,
    login: vi.fn(),
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
    isAdmin: false,
    logout: vi.fn(),
  });

/** A promise the test resolves or rejects by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("isTripId", () => {
  it("accepts a UUID in either case and nothing else", () => {
    expect(isTripId(ID)).toBe(true);
    expect(isTripId(ID.toUpperCase())).toBe(true);
    expect(isTripId(null)).toBe(false);
    expect(isTripId("")).toBe(false);
    expect(isTripId("trip_japan_2026")).toBe(false);
    expect(isTripId(`${ID}/`)).toBe(false);
  });
});

describe("useTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth(true);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts loading and ends ready with the service's trip", async () => {
    const trip = makeTrip({ id: ID });
    getTripMock.mockResolvedValue(trip);

    const { result } = renderHook(() => useTrip(ID));

    expect(result.current).toMatchObject({ status: "loading", trip: null, error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trip).toBe(trip);
    expect(getTripMock).toHaveBeenCalledTimes(1);
    expect(getTripMock.mock.calls[0]?.[0]).toBe(ID);
  });

  it("is not-found at once for a missing or malformed id, without a request", () => {
    for (const id of [null, "", "trip_japan_2026", "not a uuid"]) {
      const { result, unmount } = renderHook(() => useTrip(id));
      expect(result.current).toMatchObject({ status: "not-found", trip: null, error: null });
      unmount();
    }
    expect(getTripMock).not.toHaveBeenCalled();
  });

  it("is not-found when the service resolves null (404 or 403)", async () => {
    getTripMock.mockResolvedValue(null);

    const { result } = renderHook(() => useTrip(ID));

    await waitFor(() => expect(result.current.status).toBe("not-found"));
    expect(result.current.trip).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("does not ask the API while signed out", () => {
    auth(false);
    getTripMock.mockResolvedValue(makeTrip());

    const { result } = renderHook(() => useTrip(ID));

    expect(result.current.status).toBe("loading");
    expect(getTripMock).not.toHaveBeenCalled();
  });

  it("exposes an ApiError and keeps the session on a server failure", async () => {
    getTripMock.mockRejectedValue(new ApiError(503, "Database down", "DB_UNAVAILABLE"));

    const { result } = renderHook(() => useTrip(ID));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatchObject({ status: 503, code: "DB_UNAVAILABLE" });
    expect(result.current.trip).toBeNull();
    expect(readToken()).toBe("tok");
  });

  it("wraps a network failure (not an ApiError) into an ApiError with status 0", async () => {
    getTripMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useTrip(ID));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 0, message: "Failed to fetch" });
  });

  it("clears the session when the API rejects the token", async () => {
    getTripMock.mockRejectedValue(new UnauthorizedError("expired"));

    const { result } = renderHook(() => useTrip(ID));

    await waitFor(() => expect(readToken()).toBeNull());
    // Nothing to render: the route guard redirects once the session is gone.
    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();
  });

  it("reload() goes through loading again and replaces the error with data", async () => {
    getTripMock.mockRejectedValueOnce(new ApiError(500, "boom"));
    const { result } = renderHook(() => useTrip(ID));
    await waitFor(() => expect(result.current.status).toBe("error"));

    const trip = makeTrip({ id: ID });
    getTripMock.mockResolvedValueOnce(trip);
    act(() => result.current.reload());

    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trip).toBe(trip);
    expect(getTripMock).toHaveBeenCalledTimes(2);
  });

  it("starts over when the id changes and never shows the previous trip", async () => {
    const first = makeTrip({ id: ID });
    const second = makeTrip({ id: OTHER_ID, title: "Second" });
    getTripMock.mockResolvedValueOnce(first);
    const { result, rerender } = renderHook(({ id }) => useTrip(id), {
      initialProps: { id: ID },
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const pending = deferred<typeof second>();
    getTripMock.mockReturnValueOnce(pending.promise);
    rerender({ id: OTHER_ID });

    expect(result.current).toMatchObject({ status: "loading", trip: null });
    await act(async () => pending.resolve(second));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trip).toBe(second);
    expect(getTripMock).toHaveBeenLastCalledWith(OTHER_ID, expect.anything());
  });

  it("aborts the request on unmount and ignores its late answer", async () => {
    const pending = deferred<never>();
    getTripMock.mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useTrip(ID));
    const [, { signal }] = getTripMock.mock.calls[0] as [string, { signal: AbortSignal }];
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);

    // A rejection after the abort (what fetch does) must not surface anywhere.
    pending.reject(new ApiError(500, "late"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("loading");
  });

  it("returns a stable reload callback", () => {
    getTripMock.mockResolvedValue(null);
    const { result, rerender } = renderHook(() => useTrip(ID));
    const first = result.current.reload;
    rerender();
    expect(result.current.reload).toBe(first);
  });
});
