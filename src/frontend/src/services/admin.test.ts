import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_GRANT_PAGE,
  ADMIN_USAGE,
  ADMIN_TRIP_PAGE,
  ADMIN_USER_PAGE,
  EVAL_ITEM,
  EVAL_RUN_GOLDEN,
  EVAL_RUN_GOLDEN_DETAIL,
  RETRIEVAL_EVAL,
  TRACE_STATS,
  TURN_DETAIL,
  TURN_PAGE,
} from "@/test/fixtures/admin";
import {
  deleteAccessGrant,
  getAdminTrip,
  getAdminUsage,
  getAnswerEval,
  getStats,
  getTurn,
  listAccessGrants,
  listAnswerEvals,
  listAdminTrips,
  listAdminUsers,
  listSessionTurns,
  listTurns,
  putAccessGrant,
  runRetrievalEval,
  streamAnswerEval,
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

  it("pages the access list 200 at a time, from core_api", async () => {
    fetchMock.mockImplementation(async () => json(ACCESS_GRANT_PAGE));

    await expect(listAccessGrants()).resolves.toEqual(ACCESS_GRANT_PAGE);
    expect(called().path).toBe("/api/v1/admin/access");
    expect(Object.fromEntries(called().params)).toEqual({ limit: "200" });
    expect((called().init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    await listAccessGrants("NEXT");
    expect(Object.fromEntries(called(1).params)).toEqual({ cursor: "NEXT", limit: "200" });
  });

  it("puts a grant under its email, lower-cased and encoded, nulls included", async () => {
    const grant = ACCESS_GRANT_PAGE.items[0]!;
    fetchMock.mockImplementation(async () => json(grant));

    await expect(putAccessGrant(" Ada+Beta@Example.com ", { daily_token_limit: 0 })).resolves.toEqual(grant);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/admin\/access\/ada%2Bbeta%40example\.com$/);
    expect(called().init.method).toBe("PUT");
    expect(JSON.parse(called().init.body as string)).toEqual({ daily_token_limit: 0, note: null });

    await putAccessGrant("ada@example.com", { daily_token_limit: null, note: "team" });
    expect(JSON.parse(called(1).init.body as string)).toEqual({ daily_token_limit: null, note: "team" });
  });

  it("deletes a grant, and rejects when core_api refuses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteAccessGrant("Ada@example.com")).resolves.toBeUndefined();
    expect(called().path).toBe("/api/v1/admin/access/ada%40example.com");
    expect(called().init.method).toBe("DELETE");

    fetchMock.mockResolvedValueOnce(json({ detail: { message: "x", error_code: "NOT_FOUND" } }, 404));
    await expect(deleteAccessGrant("gone@example.com")).rejects.toMatchObject({ status: 404 });

    fetchMock.mockResolvedValueOnce(json({ detail: { message: "x", error_code: "FORBIDDEN" } }, 403));
    await expect(putAccessGrant("x@example.com", {})).rejects.toBeInstanceOf(ApiError);
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

  it("reads today's usage from ai_api, or a named day's", async () => {
    fetchMock.mockImplementation(async () => json(ADMIN_USAGE));

    await expect(getAdminUsage()).resolves.toEqual(ADMIN_USAGE);
    expect(called().path).toBe("/api/v1/ai/admin/usage");
    expect(Object.fromEntries(called().params)).toEqual({});
    expect((called().init.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    await getAdminUsage("2026-09-30");
    expect(Object.fromEntries(called(1).params)).toEqual({ day: "2026-09-30" });
  });

  it("runs the retrieval evaluation with a POST to ai_api", async () => {
    fetchMock.mockResolvedValue(json(RETRIEVAL_EVAL));

    await expect(runRetrievalEval()).resolves.toEqual(RETRIEVAL_EVAL);

    const { path, init } = called();
    expect(path).toBe("/api/v1/ai/admin/retrieval-eval");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("streams an evaluation run's events and drops anything else", async () => {
    const lines = [
      { type: "progress", done: 1, total: 2, item: EVAL_ITEM },
      { type: "other" },
      { type: "report", run: EVAL_RUN_GOLDEN },
    ]
      .map((event) => `data: ${JSON.stringify(event)}

`)
      .join("");
    fetchMock.mockResolvedValue(new Response(`${lines}data: [DONE]

`, { status: 200 }));

    const events = [];
    for await (const event of streamAnswerEval("golden")) events.push(event.type);

    expect(events).toEqual(["progress", "report"]);
    const { path, init } = called();
    expect(path).toBe("/api/v1/ai/admin/answer-eval");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ set: "golden" }));
  });

  it("refuses a run while another is in progress with a 409", async () => {
    fetchMock.mockResolvedValue(json({ detail: "An evaluation is already running", error_code: "CONFLICT" }, 409));

    const consume = async () => {
      for await (const event of streamAnswerEval("questions")) void event;
    };

    await expect(consume()).rejects.toMatchObject({ status: 409 });
  });

  it("lists the runs and opens one, null when it is gone", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [EVAL_RUN_GOLDEN] }))
      .mockResolvedValueOnce(json(EVAL_RUN_GOLDEN_DETAIL))
      .mockResolvedValueOnce(json({ detail: "Evaluation run not found" }, 404));

    await expect(listAnswerEvals()).resolves.toEqual({ items: [EVAL_RUN_GOLDEN] });
    await expect(getAnswerEval("run golden")).resolves.toEqual(EVAL_RUN_GOLDEN_DETAIL);
    await expect(getAnswerEval("gone")).resolves.toBeNull();

    expect(called(0).path).toBe("/api/v1/ai/admin/answer-evals");
    expect(called(1).path).toBe("/api/v1/ai/admin/answer-evals/run%20golden");
  });
});
