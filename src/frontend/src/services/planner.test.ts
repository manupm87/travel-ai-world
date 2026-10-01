import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TURNS, toSseBody } from "@/data/planner-demo/session";
import type { OptionCard, PlannerEvent, PlannerTurn } from "@/types/planner";
import { EMPTY_BRIEF } from "@/types/planner";
import { apiUrl, ApiError, UnauthorizedError } from "./http";
import { parsePlannerEvents, streamPlannerTurn, toPlannerEvent, toPlannerFailure } from "./planner";
import { clearSession, writeSession } from "./session";

// The planner falls back to the recorded session when no ai_api URL is
// configured (TRA-158); the stream tests below want the network path, so the
// backend is "configured" unless a test says otherwise.
let aiAvailable = true;
vi.mock("./http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./http")>();
  return { ...actual, isAiAvailable: () => aiAvailable };
});

describe("parsePlannerEvents", () => {
  it("parses a typed text event", () => {
    const { events } = parsePlannerEvents('data: {"type":"text","delta":"Hola"}\n');
    expect(events).toEqual([{ type: "text", delta: "Hola" }]);
  });

  it("parses a progress event, and drops a step it does not know (TRA-242)", () => {
    const good = { type: "progress", step: "wardrobe", detail: "Looking.", sources: ["Wikivoyage", 3] };
    const bad = { type: "progress", step: "teleport", detail: "?", sources: [] };
    const { events } = parsePlannerEvents(
      `data: ${JSON.stringify(good)}
data: ${JSON.stringify(bad)}
`
    );
    expect(events).toEqual([
      { type: "progress", step: "wardrobe", detail: "Looking.", sources: ["Wikivoyage"] },
    ]);
  });

  it("parses a typed brief event", () => {
    const payload = {
      type: "brief",
      brief: { ...EMPTY_BRIEF, destination: "Budapest" },
      missing: ["dates"],
    };
    const { events } = parsePlannerEvents(`data: ${JSON.stringify(payload)}\n`);
    expect(events).toEqual([payload]);
  });

  it("parses a typed options event", () => {
    const payload = {
      type: "options",
      group_id: "g-hotels",
      kind: "hotel",
      prompt: "Pick a hotel",
      slot: null,
      selection: "single",
      cards: [
        {
          id: "wv:hotel-rum",
          title: "Hotel Rum Budapest",
          subtitle: null,
          district: "Belváros",
          category: "sleep",
          image_url: null,
          image_credit: null,
          price_tier: 2,
          rating_text: null,
          hours: null,
          lat: 47.4897,
          lon: 19.0576,
          why: "Five minutes on foot from the Great Market Hall",
          source: "Wikivoyage",
          source_url: "https://en.wikivoyage.org/wiki/Budapest",
          license: "CC BY-SA 4.0",
          deep_link: null,
        },
      ],
    };
    const { events } = parsePlannerEvents(`data: ${JSON.stringify(payload)}\n`);
    expect(events).toEqual([payload]);
  });

  it("parses a typed itinerary_patch event", () => {
    const payload = {
      type: "itinerary_patch",
      ops: [{ op: "set_day_title", day: 1, title: "Arrival" }],
    };
    const { events } = parsePlannerEvents(`data: ${JSON.stringify(payload)}\n`);
    expect(events).toEqual([payload]);
  });

  it("parses a typed error event", () => {
    const payload = { type: "error", error: "model overloaded", error_code: "rate_limited" };
    const { events } = parsePlannerEvents(`data: ${JSON.stringify(payload)}\n`);
    expect(events).toEqual([payload]);
  });

  it("returns a trailing partial line as rest", () => {
    const { events, rest } = parsePlannerEvents(
      'data: {"type":"text","delta":"Hi"}\ndata: {"type":"te'
    );
    expect(events).toEqual([{ type: "text", delta: "Hi" }]);
    expect(rest).toBe('data: {"type":"te');
  });

  it("completes a line split across chunks", () => {
    const first = parsePlannerEvents('data: {"type":"text","delta":"Ho');
    expect(first.events).toEqual([]);
    const second = parsePlannerEvents(first.rest + 'la"}\n');
    expect(second).toEqual({ events: [{ type: "text", delta: "Hola" }], rest: "" });
  });

  it("yields done and drops anything after it", () => {
    const { events, rest } = parsePlannerEvents(
      'data: {"type":"text","delta":"a"}\ndata: [DONE]\ndata: {"type":"text","delta":"ignored"}\n'
    );
    expect(events).toEqual([{ type: "text", delta: "a" }, { type: "done" }]);
    expect(rest).toBe("");
  });

  it("ignores an event type this build does not know", () => {
    const { events } = parsePlannerEvents('data: {"type":"future_event","payload":"x"}\n');
    expect(events).toEqual([]);
  });

  it("skips malformed JSON", () => {
    const { events } = parsePlannerEvents(
      'data: not json at all\ndata: {"type":"text","delta":"ok"}\n'
    );
    expect(events).toEqual([{ type: "text", delta: "ok" }]);
  });

  it("skips non-data lines", () => {
    const { events } = parsePlannerEvents('event: ping\n\ndata: {"type":"text","delta":"ok"}\n');
    expect(events).toEqual([{ type: "text", delta: "ok" }]);
  });

  it("maps the legacy {content} line to a text event", () => {
    const { events } = parsePlannerEvents('data: {"content":"legacy chunk"}\n');
    expect(events).toEqual([{ type: "text", delta: "legacy chunk" }]);
  });

  it("maps the legacy {error} line to an error event with error_code upstream_error", () => {
    const { events } = parsePlannerEvents('data: {"error":"model overloaded"}\n');
    expect(events).toEqual([
      { type: "error", error: "model overloaded", error_code: "upstream_error" },
    ]);
  });

  describe("recorded fixture", () => {
    it("parses the full session recording and stops at [DONE]", () => {
      // fileURLToPath, not `URL.pathname`: the latter is `/C:/...` (and
      // percent-encoded) on Windows, which no file API can open.
      const fixturePath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../test/fixtures/planner-budapest.sse"
      );
      const raw = readFileSync(fixturePath, "utf8");
      const { events, rest } = parsePlannerEvents(raw);

      expect(events).toEqual([
        { type: "text", delta: "Perfect. For food, thermal baths and history " },
        { type: "text", delta: "these neighbourhoods fit." },
        {
          type: "brief",
          brief: {
            destination: "Budapest",
            origin: "Madrid",
            start_date: "2026-10-23",
            end_date: "2026-10-27",
            nights: 4,
            adults: 2,
            children: 0,
            budget_tier: 2,
            interests: ["food", "thermal_baths", "history"],
            pace: "balanced",
          },
          missing: [],
        },
        {
          type: "options",
          group_id: "g-neighbourhoods",
          kind: "neighbourhood",
          prompt: "Where would you like to stay?",
          slot: null,
          selection: "single",
          cards: [
            {
              id: "wv:belvaros",
              title: "Belváros",
              subtitle: "Downtown",
              district: "Pest",
              category: "district",
              image_url: null,
              image_credit: null,
              price_tier: 2,
              rating_text: null,
              hours: null,
              lat: 47.4925,
              lon: 19.0513,
              why: "By the Danube and the Great Market Hall",
              source: "Wikivoyage",
              source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros",
              license: "CC BY-SA 4.0",
              deep_link: null,
            },
            {
              id: "wv:budavar",
              title: "Budavár",
              subtitle: "Castle District",
              district: "Buda",
              category: "district",
              image_url: null,
              image_credit: null,
              price_tier: 3,
              rating_text: null,
              hours: null,
              lat: null,
              lon: null,
              why: "Quiet at night, views of the Parliament",
              source: "Wikivoyage",
              source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r",
              license: "CC BY-SA 4.0",
              deep_link: null,
            },
          ],
        },
        {
          type: "itinerary_patch",
          ops: [
            {
              op: "set_route",
              origin: "Madrid",
              destination: "Budapest",
              outbound_date: "2026-10-23",
              return_date: "2026-10-27",
              deep_link: "https://www.google.com/travel/flights?q=Flights%20from%20MAD%20to%20BUD",
            },
            {
              op: "warn",
              slot: null,
              code: "unverified_price",
              message: "Flight prices are not shown in phase 1",
            },
          ],
        },
        { type: "text", delta: "legacy chunk" },
        { type: "done" },
      ]);
      expect(rest).toBe("");
    });
  });
});

describe("toPlannerEvent — options defaults", () => {
  it("defaults kind, prompt, slot and selection, and drops cards without id or title", () => {
    const event = toPlannerEvent({
      type: "options",
      group_id: "g1",
      cards: [{ id: "c1", title: "Card 1" }, { title: "no id" }, { id: "c2" }],
    });
    expect(event).toEqual({
      type: "options",
      group_id: "g1",
      kind: "experience",
      prompt: "",
      slot: null,
      selection: "single",
      cards: [expect.objectContaining({ id: "c1", title: "Card 1" })],
    });
  });

  it("keeps an explicit multi selection and a recognised kind", () => {
    const event = toPlannerEvent({
      type: "options",
      group_id: "g1",
      kind: "hotel",
      selection: "multi",
      cards: [],
    });
    expect(event).toMatchObject({ kind: "hotel", selection: "multi" });
  });

  it("falls back to experience for an unrecognised kind", () => {
    const event = toPlannerEvent({ type: "options", group_id: "g1", kind: "bogus", cards: [] });
    expect(event).toMatchObject({ kind: "experience" });
  });

  it("clamps price_tier outside 1..3 to null", () => {
    const event = toPlannerEvent({
      type: "options",
      group_id: "g1",
      cards: [
        { id: "c1", title: "Zero", price_tier: 0 },
        { id: "c2", title: "Four", price_tier: 4 },
        { id: "c3", title: "Valid", price_tier: 2 },
      ],
    });
    const cards = (event as { cards: OptionCard[] }).cards;
    expect(cards.map((c) => c.price_tier)).toEqual([null, null, 2]);
  });

  it("returns null without a group_id or a cards array", () => {
    expect(toPlannerEvent({ type: "options", cards: [] })).toBeNull();
    expect(toPlannerEvent({ type: "options", group_id: "g1" })).toBeNull();
  });
});

describe("toPlannerEvent — brief", () => {
  it("keeps only valid missing fields and fills the TripBrief shape", () => {
    const event = toPlannerEvent({
      type: "brief",
      brief: { destination: "Rome" },
      missing: ["destination", "not_a_field", 42, "interests"],
    });
    expect(event).toEqual({
      type: "brief",
      brief: { ...EMPTY_BRIEF, destination: "Rome" },
      missing: ["destination", "interests"],
    });
  });

  it("falls back to the empty brief when brief is not an object", () => {
    const event = toPlannerEvent({ type: "brief", brief: null, missing: [] });
    expect(event).toEqual({ type: "brief", brief: EMPTY_BRIEF, missing: [] });
  });
});

/** A Response whose body streams the given text chunks (encoded whole). */
function sseResponse(chunks: string[], init: ResponseInit = { status: 200 }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, init);
}

/** A Response whose body streams raw bytes cut into fixed-size chunks, so a
 * multi-byte UTF-8 character can land split across two reads. */
function byteResponse(bytes: Uint8Array, chunkSize: number) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(body);
}

async function collect(gen: AsyncGenerator<PlannerEvent>) {
  const out: PlannerEvent[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

const TURN: PlannerTurn = {
  message: "hello",
  action: null,
  history: [],
  brief: null,
  itinerary: null,
  exclude_card_ids: [],
  trip_id: null,
  session_id: null,
  language: "en",
};

describe("streamPlannerTurn", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("posts the turn to the ai planner URL with the bearer token and the abort signal", async () => {
    fetchMock.mockResolvedValue(sseResponse(["data: [DONE]\n"]));
    const controller = new AbortController();

    await collect(streamPlannerTurn(TURN, { signal: controller.signal }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(apiUrl("ai", "/ai/planner"));
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(TURN);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(init.signal).toBe(controller.signal);
  });

  it("yields every event ending with done, and stops even if the body has more", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([toSseBody(TURNS.opening) + 'data: {"type":"text","delta":"ignored"}\n'])
    );

    const events = await collect(streamPlannerTurn(TURN));

    expect(events).toEqual(TURNS.opening);
  });

  it("rejects with UnauthorizedError on a 401", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }));

    await expect(collect(streamPlannerTurn(TURN))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects with ApiError on a server error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "boom" }), { status: 500 }));

    await expect(collect(streamPlannerTurn(TURN))).rejects.toBeInstanceOf(ApiError);
  });

  it("parses a body delivered in arbitrary byte chunks, including mid multi-byte characters", async () => {
    const events: PlannerEvent[] = [
      { type: "text", delta: "Buenos días en Budapest, aún de mañana" },
      { type: "done" },
    ];
    const bytes = new TextEncoder().encode(toSseBody(events));
    // 3-byte chunks are guaranteed to split some of the 2-byte UTF-8 accented
    // characters above mid-sequence.
    fetchMock.mockResolvedValue(byteResponse(bytes, 3));

    const received = await collect(streamPlannerTurn(TURN));

    expect(received).toEqual(events);
  });

  it("yields an in-stream error event instead of throwing", async () => {
    const events: PlannerEvent[] = [
      { type: "error", error: "rate limited", error_code: "rate_limited" },
      { type: "done" },
    ];
    fetchMock.mockResolvedValue(sseResponse([toSseBody(events)]));

    const received = await collect(streamPlannerTurn(TURN));

    expect(received).toEqual(events);
  });

  it("rejects when the request is aborted", async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    fetchMock.mockRejectedValue(abortError);
    controller.abort();

    await expect(
      collect(streamPlannerTurn(TURN, { signal: controller.signal }))
    ).rejects.toBe(abortError);
  });
});

describe("streamPlannerTurn — demo fallback (TRA-158)", () => {
  const fetchMock = vi.fn();
  const turn: PlannerTurn = {
    message: "5 days in Budapest from Madrid with my partner, late October. We love food, thermal baths and history.",
    action: null,
    history: [],
    brief: null,
    itinerary: null,
    exclude_card_ids: [],
    trip_id: null,
    session_id: null,
    language: "en",
  };

  beforeEach(() => {
    aiAvailable = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("answers from the recorded session when the planner route is not deployed (404)", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })
    );
    const onDemo = vi.fn();

    const events = await collect(streamPlannerTurn(turn, { onDemo }));

    expect(onDemo).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(events.some((e) => e.type === "brief")).toBe(true);
  });

  it("still surfaces other failures (a 500 is not a missing route)", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    const onDemo = vi.fn();

    await expect(collect(streamPlannerTurn(turn, { onDemo }))).rejects.toBeInstanceOf(ApiError);
    expect(onDemo).not.toHaveBeenCalled();
  });

  it("skips the network entirely when no ai_api URL is configured", async () => {
    aiAvailable = false;
    const onDemo = vi.fn();

    const events = await collect(streamPlannerTurn(turn, { onDemo }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDemo).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: "done" });
  });
});

describe("toPlannerFailure (TRA-258)", () => {
  it("a 429 DAILY_TOKEN_LIMIT is the quota, with its reset time", () => {
    const err = new ApiError(429, "Daily token limit reached", "DAILY_TOKEN_LIMIT", {
      limit: 1000,
      used: 1200,
      resets_at: "2026-10-02T00:00:00+00:00",
    });
    expect(toPlannerFailure(err)).toEqual({ kind: "quota", resetsAt: "2026-10-02T00:00:00+00:00" });
  });

  it("a quota without a readable reset time is still the quota", () => {
    expect(toPlannerFailure(new ApiError(429, "x", "DAILY_TOKEN_LIMIT"))).toEqual({
      kind: "quota",
      resetsAt: null,
    });
    expect(toPlannerFailure(new ApiError(429, "x", "DAILY_TOKEN_LIMIT", { resets_at: 7 })).resetsAt).toBeNull();
  });

  it("a 403 ACCESS_DENIED is the access list", () => {
    expect(toPlannerFailure(new ApiError(403, "x", "ACCESS_DENIED"))).toEqual({ kind: "denied", resetsAt: null });
  });

  it("a 401 is the session, and everything else is generic", () => {
    expect(toPlannerFailure(new UnauthorizedError()).kind).toBe("unauthorized");
    expect(toPlannerFailure(new ApiError(429, "slow down", "TOO_MANY_REQUESTS")).kind).toBe("generic");
    expect(toPlannerFailure(new ApiError(403, "x", "FORBIDDEN")).kind).toBe("generic");
    expect(toPlannerFailure(new ApiError(503, "x", "SERVICE_UNAVAILABLE")).kind).toBe("generic");
    expect(toPlannerFailure(new Error("boom")).kind).toBe("generic");
  });
});

describe("streamPlannerTurn — refused before the stream (TRA-258)", () => {
  const fetchMock = vi.fn();
  const refusal = (status: number, detail: object) =>
    new Response(JSON.stringify({ detail }), { status, headers: { "content-type": "application/json" } });

  beforeEach(() => {
    aiAvailable = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    writeSession("tok", { id: "1", email: "a@b.c", name: "A" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("rejects a 429 with the code and the extras the page needs", async () => {
    fetchMock.mockResolvedValue(
      refusal(429, {
        message: "Daily token limit reached",
        error_code: "DAILY_TOKEN_LIMIT",
        extras: { limit: 1000, used: 1000, resets_at: "2026-10-02T00:00:00+00:00" },
      })
    );
    const onDemo = vi.fn();

    const failure = await streamPlannerTurn({} as PlannerTurn, { onDemo })
      .next()
      .then(
        () => null,
        (err: unknown) => toPlannerFailure(err)
      );

    expect(failure).toEqual({ kind: "quota", resetsAt: "2026-10-02T00:00:00+00:00" });
    // A refusal is not a missing route: the recorded demo must not answer instead.
    expect(onDemo).not.toHaveBeenCalled();
  });

  it("rejects a 403 ACCESS_DENIED as denied", async () => {
    fetchMock.mockResolvedValue(
      refusal(403, { message: "This account has not been given access yet", error_code: "ACCESS_DENIED" })
    );

    const failure = await streamPlannerTurn({} as PlannerTurn)
      .next()
      .then(
        () => null,
        (err: unknown) => toPlannerFailure(err)
      );

    expect(failure).toEqual({ kind: "denied", resetsAt: null });
  });

  // In production CloudFront rewrites every API 403 into an HTML 404, so the
  // refusal above arrives looking like a route that is not deployed.
  describe("a 404 on the route, behind CloudFront", () => {
    const turn: PlannerTurn = {
      message: "5 days in Budapest",
      action: null,
      history: [],
      brief: null,
      itinerary: null,
      exclude_card_ids: [],
      trip_id: null,
      session_id: null,
      language: "en",
    };
    const notFound = () => new Response("<html>Not found</html>", { status: 404 });
    const access = (allowed: boolean) =>
      new Response(
        JSON.stringify({ allowed, mode: "allowlist", is_admin: false, daily_token_limit: null }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const answer = (accessAnswer: () => Response | Promise<Response>) =>
      fetchMock.mockImplementation((input: RequestInfo | URL) =>
        String(input).includes("/users/me/access") ? accessAnswer() : Promise.resolve(notFound())
      );
    const drain = async (gen: AsyncGenerator<PlannerEvent>) => {
      const events: PlannerEvent[] = [];
      for await (const event of gen) events.push(event);
      return events;
    };

    it("is denied, with no demo, when the access read says not allowed", async () => {
      answer(() => access(false));
      const onDemo = vi.fn();

      const failure = await streamPlannerTurn(turn, { onDemo })
        .next()
        .then(
          () => null,
          (err: unknown) => toPlannerFailure(err)
        );

      expect(failure).toEqual({ kind: "denied", resetsAt: null });
      expect(onDemo).not.toHaveBeenCalled();
    });

    it("plays the demo as before when the account is allowed", async () => {
      answer(() => access(true));
      const onDemo = vi.fn();

      const events = await drain(streamPlannerTurn(turn, { onDemo }));

      expect(onDemo).toHaveBeenCalledTimes(1);
      expect(events.at(-1)).toEqual({ type: "done" });
    });

    it("plays the demo as before when the access read fails", async () => {
      answer(() => new Response("boom", { status: 500 }));
      const onDemo = vi.fn();

      const events = await drain(streamPlannerTurn(turn, { onDemo }));

      expect(onDemo).toHaveBeenCalledTimes(1);
      expect(events.at(-1)).toEqual({ type: "done" });
    });

    it("plays the demo as before when the access read cannot be made", async () => {
      answer(() => Promise.reject(new TypeError("Failed to fetch")));
      const onDemo = vi.fn();

      const events = await drain(streamPlannerTurn(turn, { onDemo }));

      expect(onDemo).toHaveBeenCalledTimes(1);
      expect(events.at(-1)).toEqual({ type: "done" });
    });
  });
});
