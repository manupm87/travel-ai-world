import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMyAccess } from "./access";
import { ApiError } from "./http";
import { clearSession, writeSession } from "./session";

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("getMyAccess", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("asks core_api for the caller's access with the bearer token", async () => {
    fetchMock.mockResolvedValue(json({ allowed: false, daily_token_limit: 300000 }));

    await expect(getMyAccess()).resolves.toEqual({ allowed: false, daily_token_limit: 300000 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/users\/me\/access$/);
    expect(init.method ?? "GET").toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("passes an unlimited account through as a null limit", async () => {
    fetchMock.mockResolvedValue(json({ allowed: true, daily_token_limit: null }));

    await expect(getMyAccess()).resolves.toEqual({ allowed: true, daily_token_limit: null });
  });

  it("answers null on 401 and 404, and rethrows the rest", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(getMyAccess()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(json({}, 401));
    await expect(getMyAccess()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(getMyAccess()).rejects.toBeInstanceOf(ApiError);

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(getMyAccess()).rejects.toBeInstanceOf(TypeError);
  });
});
