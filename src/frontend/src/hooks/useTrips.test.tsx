import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, UnauthorizedError } from "@/services/http";
import { readToken, writeSession } from "@/services/session";
import { listTrips } from "@/services/trips";
import { makeTripSummary } from "@/test/fixtures";
import { useTrips } from "./useTrips";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/services/trips", () => ({
  listTrips: vi.fn(),
}));

const listTripsMock = vi.mocked(listTrips);

const auth = (isAuthenticated: boolean) =>
  vi.mocked(useAuth).mockReturnValue({
    isAuthenticated,
    isLoading: false,
    user: null,
    provider: "google" as const,
    login: vi.fn(),
    loginWithRedirect: vi.fn(),
    completeLogin: vi.fn(),
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

describe("useTrips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth(true);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts loading and ends ready with the service's trips", async () => {
    const trips = [makeTripSummary({ id: "a" }), makeTripSummary({ id: "b" })];
    listTripsMock.mockResolvedValue(trips);

    const { result } = renderHook(() => useTrips());

    expect(result.current).toMatchObject({ status: "loading", trips: [], error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trips).toEqual(trips);
    expect(listTripsMock).toHaveBeenCalledTimes(1);
  });

  it("does not ask the API while signed out", () => {
    auth(false);
    listTripsMock.mockResolvedValue([]);

    const { result } = renderHook(() => useTrips());

    expect(result.current.status).toBe("loading");
    expect(listTripsMock).not.toHaveBeenCalled();
  });

  it("exposes an ApiError and keeps the session on a server failure", async () => {
    listTripsMock.mockRejectedValue(new ApiError(503, "Database down", "DB_UNAVAILABLE"));

    const { result } = renderHook(() => useTrips());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatchObject({ status: 503, code: "DB_UNAVAILABLE" });
    expect(result.current.trips).toEqual([]);
    expect(readToken()).toBe("tok");
  });

  it("wraps a network failure (not an ApiError) into an ApiError with status 0", async () => {
    listTripsMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useTrips());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ status: 0, message: "Failed to fetch" });
  });

  it("clears the session when the API rejects the token", async () => {
    listTripsMock.mockRejectedValue(new UnauthorizedError("expired"));

    const { result } = renderHook(() => useTrips());

    await waitFor(() => expect(readToken()).toBeNull());
    // Nothing to render: the route guard redirects once the session is gone.
    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();
  });

  it("reload() goes through loading again and replaces the error with data", async () => {
    listTripsMock.mockRejectedValueOnce(new ApiError(500, "boom"));
    const { result } = renderHook(() => useTrips());
    await waitFor(() => expect(result.current.status).toBe("error"));

    const trips = [makeTripSummary()];
    listTripsMock.mockResolvedValueOnce(trips);
    act(() => result.current.reload());

    expect(result.current).toMatchObject({ status: "loading", error: null });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trips).toEqual(trips);
    expect(listTripsMock).toHaveBeenCalledTimes(2);
  });

  it("aborts the request on unmount and ignores its late answer", async () => {
    const pending = deferred<never>();
    listTripsMock.mockReturnValue(pending.promise);

    const { result, unmount } = renderHook(() => useTrips());
    const [{ signal }] = listTripsMock.mock.calls[0] as [{ signal: AbortSignal }];
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
    listTripsMock.mockResolvedValue([]);
    const { result, rerender } = renderHook(() => useTrips());
    const first = result.current.reload;
    rerender();
    expect(result.current.reload).toBe(first);
  });
});
