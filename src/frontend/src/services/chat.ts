/**
 * AI chat against ai_api (Server-Sent Events).
 */

import type { components } from "@/types/generated/ai-api";
import { requestRaw } from "./http";

export type ChatMessage = components["schemas"]["ChatMessage"];
type ChatRequest = components["schemas"]["ChatRequest"];

export type SseEvent =
  | { type: "content"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ParsedSse {
  events: SseEvent[];
  /** Trailing partial line, to be prepended to the next chunk. */
  rest: string;
}

/**
 * Parses the complete lines of an SSE buffer. Pure.
 *
 * Wire format, one JSON object per `data:` line, terminated by `[DONE]`:
 *   data: {"content": "Hola"}
 *   data: {"error": "..."}
 *   data: [DONE]
 *
 * Lines that are not `data:`, or whose payload is not JSON, are skipped; the
 * last line is returned as `rest` when the chunk was cut mid-line. Parsing
 * stops at `[DONE]`.
 */
export function parseSseEvents(buffer: string): ParsedSse {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: SseEvent[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      events.push({ type: "done" });
      return { events, rest: "" };
    }
    let parsed: { content?: unknown; error?: unknown };
    try {
      parsed = JSON.parse(data);
    } catch {
      continue; // malformed chunk: skip
    }
    if (typeof parsed.error === "string" && parsed.error) {
      events.push({ type: "error", message: parsed.error });
    } else if (typeof parsed.content === "string" && parsed.content) {
      events.push({ type: "content", text: parsed.content });
    }
  }

  return { events, rest };
}

export interface StreamChatOptions {
  /** Abort the request and stop reading the stream. */
  signal?: AbortSignal;
}

/**
 * Streams a chat completion. Yields content chunks as they arrive.
 * Throws `UnauthorizedError` on 401, `ApiError` on other failures, and an
 * `Error` carrying the server's message on an in-stream `{"error"}` event.
 */
export async function* streamChat(
  message: string,
  history: ChatMessage[],
  { signal }: StreamChatOptions = {}
): AsyncGenerator<string, void, unknown> {
  const body: ChatRequest = { message, history };
  const res = await requestRaw("ai", "/ai/chat", {
    method: "POST",
    json: body,
    auth: true,
    signal,
  });

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const { events, rest } = parseSseEvents(
        buffer + decoder.decode(value, { stream: true })
      );
      buffer = rest;

      for (const event of events) {
        if (event.type === "done") return;
        if (event.type === "error") throw new Error(event.message);
        yield event.text;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
