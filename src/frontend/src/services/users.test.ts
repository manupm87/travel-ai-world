import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_USER_PAGE } from "@/test/fixtures/admin";
import { ApiError } from "./http";
import { clearSession, writeSession } from "./session";
import { getMe } from "./users";

const fetchMock = vi.fn();
const me = ADMIN_USER_PAGE.items[0]!;

describe("getMe", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("asks core_api for the signed-in account with the bearer token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(me), { status: 200 }));

    await expect(getMe()).resolves.toEqual(me);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/users\/me$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("answers null on 401 and 404, and rethrows the rest", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await expect(getMe()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(getMe()).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(getMe()).rejects.toBeInstanceOf(ApiError);
  });
});
