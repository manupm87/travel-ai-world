import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApiError,
  UnauthorizedError,
  apiUrl,
  isAiAvailable,
  isApiAvailable,
  parseErrorBody,
  readErrorMessage,
  request,
  requestRaw,
} from "./http";
import { writeSession, clearSession } from "./session";

/** Re-imports http.ts so module-level env reads see the stubbed variables. */
async function loadWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return import("./http");
}

describe("http", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearSession();
  });

  describe("base URLs", () => {
    it("uses the core URL for both services when no AI URL is set", async () => {
      const http = await loadWithEnv({
        NEXT_PUBLIC_API_URL: "https://core.example",
        NEXT_PUBLIC_AI_API_URL: undefined,
      });
      expect(http.apiUrl("core", "/auth/google")).toBe("https://core.example/api/v1/auth/google");
      expect(http.apiUrl("ai", "/ai/chat")).toBe("https://core.example/api/v1/ai/chat");
      expect(http.isApiAvailable()).toBe(true);
      expect(http.isAiAvailable()).toBe(true);
    });

    it("routes AI calls to the AI URL when one is set", async () => {
      const http = await loadWithEnv({
        NEXT_PUBLIC_API_URL: "https://core.example",
        NEXT_PUBLIC_AI_API_URL: "https://ai.example",
      });
      expect(http.apiUrl("core", "/x")).toBe("https://core.example/api/v1/x");
      expect(http.apiUrl("ai", "/x")).toBe("https://ai.example/api/v1/x");
    });

    it("reports both services unavailable in a static build", async () => {
      const http = await loadWithEnv({
        NEXT_PUBLIC_API_URL: undefined,
        NEXT_PUBLIC_AI_API_URL: undefined,
      });
      expect(http.isApiAvailable()).toBe(false);
      expect(http.isAiAvailable()).toBe(false);
      expect(http.apiUrl("core", "/x")).toBe("/api/v1/x");
    });

    it("exposes the same helpers from the statically imported module", () => {
      expect(typeof apiUrl("core", "/x")).toBe("string");
      expect(typeof isApiAvailable()).toBe("boolean");
      expect(typeof isAiAvailable()).toBe("boolean");
    });
  });

  describe("parseErrorBody", () => {
    it("reads domain errors with message and code", () => {
      expect(
        parseErrorBody({ detail: { message: "Nope", error_code: "TRIP_NOT_FOUND" } })
      ).toEqual({ message: "Nope", code: "TRIP_NOT_FOUND" });
    });

    it("reads framework errors with a string detail", () => {
      expect(parseErrorBody({ detail: "Not authenticated" })).toEqual({
        message: "Not authenticated",
        code: null,
      });
    });

    it("tolerates unknown shapes", () => {
      expect(parseErrorBody(null)).toEqual({ message: null, code: null });
      expect(parseErrorBody({})).toEqual({ message: null, code: null });
      expect(parseErrorBody({ detail: { message: 42 } })).toEqual({ message: null, code: null });
      expect(parseErrorBody("oops")).toEqual({ message: null, code: null });
    });
  });

  describe("readErrorMessage", () => {
    it("falls back when the body is not JSON", async () => {
      const res = new Response("<html>", { status: 502 });
      expect(await readErrorMessage(res, "fallback")).toBe("fallback");
    });

    it("prefers the body's message", async () => {
      const res = new Response(JSON.stringify({ detail: "Boom" }), { status: 500 });
      expect(await readErrorMessage(res, "fallback")).toBe("Boom");
    });
  });

  describe("request", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });

    it("serialises `json`, sets the content type and decodes the response", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const data = await request<{ ok: boolean }>("core", "/things", {
        method: "POST",
        json: { a: 1 },
      });

      expect(data).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/v1\/things$/);
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    });

    it("attaches the bearer token when `auth` is set", async () => {
      writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
      fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

      await requestRaw("ai", "/ai/chat", { auth: true });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    });

    it("refuses to call the backend without a session when `auth` is set", async () => {
      await expect(requestRaw("ai", "/ai/chat", { auth: true })).rejects.toBeInstanceOf(
        UnauthorizedError
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws ApiError with the backend's status, message and code", async () => {
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { message: "No such trip", error_code: "TRIP_NOT_FOUND" } }),
          { status: 404 }
        )
      );

      const failure = await request("core", "/trips/9").catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({ status: 404, message: "No such trip", code: "TRIP_NOT_FOUND" });
    });

    it("throws UnauthorizedError (an ApiError) on 401", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ detail: "Token expired" }), { status: 401 })
      );

      const failure = await request("core", "/me").catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(UnauthorizedError);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).message).toBe("Token expired");
    });

    it("gives a status-based message when the error body is unusable", async () => {
      fetchMock.mockResolvedValue(new Response("gateway", { status: 502 }));

      await expect(request("core", "/x")).rejects.toThrow("Request failed with status 502");
    });
  });
});
