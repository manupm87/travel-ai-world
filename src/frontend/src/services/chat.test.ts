import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseSseEvents, streamChat } from "./chat";
import { UnauthorizedError } from "./http";
import { clearSession, writeSession } from "./session";

describe("parseSseEvents", () => {
  it("parses content events and keeps a partial trailing line", () => {
    const { events, rest } = parseSseEvents(
      'data: {"content": "Hel"}\ndata: {"content": "lo"}\ndata: {"cont'
    );
    expect(events).toEqual([
      { type: "content", text: "Hel" },
      { type: "content", text: "lo" },
    ]);
    expect(rest).toBe('data: {"cont');
  });

  it("completes a line that was split across chunks", () => {
    const first = parseSseEvents('data: {"content": "Ho');
    const second = parseSseEvents(first.rest + 'la"}\n');
    expect(first.events).toEqual([]);
    expect(second).toEqual({ events: [{ type: "content", text: "Hola" }], rest: "" });
  });

  it("stops at [DONE] and drops anything after it", () => {
    const { events, rest } = parseSseEvents(
      'data: {"content": "a"}\ndata: [DONE]\ndata: {"content": "ignored"}\n'
    );
    expect(events).toEqual([{ type: "content", text: "a" }, { type: "done" }]);
    expect(rest).toBe("");
  });

  it("surfaces in-stream errors", () => {
    const { events } = parseSseEvents('data: {"error": "model overloaded"}\n');
    expect(events).toEqual([{ type: "error", message: "model overloaded" }]);
  });

  it("skips malformed, empty and non-data lines", () => {
    const { events } = parseSseEvents(
      'event: ping\n\ndata: not json\ndata: {"content": ""}\ndata: {"content": "ok"}\n'
    );
    expect(events).toEqual([{ type: "content", text: "ok" }]);
  });
});

/** A Response whose body streams the given text chunks. */
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

async function collect(gen: AsyncGenerator<string>) {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

describe("streamChat", () => {
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

  it("posts the message with the bearer token and yields content until [DONE]", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(['data: {"content": "Hi "}\ndata: {"con', 'tent": "there"}\ndata: [DONE]\n'])
    );

    const chunks = await collect(streamChat("hello", [{ role: "user", content: "earlier" }]));

    expect(chunks).toEqual(["Hi ", "there"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/ai\/chat$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({
      message: "hello",
      history: [{ role: "user", content: "earlier" }],
    });
  });

  it("throws the server's message on an in-stream error event", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(['data: {"content": "partial"}\ndata: {"error": "overloaded"}\n'])
    );

    const gen = streamChat("hello", []);
    await expect(gen.next()).resolves.toEqual({ value: "partial", done: false });
    await expect(gen.next()).rejects.toThrow("overloaded");
  });

  it("throws UnauthorizedError on 401 before reading any body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "expired" }), { status: 401 })
    );

    await expect(collect(streamChat("hello", []))).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("passes the abort signal to fetch", async () => {
    fetchMock.mockResolvedValue(sseResponse(["data: [DONE]\n"]));
    const controller = new AbortController();

    await collect(streamChat("hello", [], { signal: controller.signal }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
