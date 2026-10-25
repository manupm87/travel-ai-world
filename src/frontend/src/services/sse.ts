/**
 * Reads a server-sent stream the way ai_api frames one (`sse_events`): one JSON object per
 * `data:` line, `data: [DONE]` last.
 */

/**
 * Every `data:` payload of `res`, parsed, until `[DONE]` or the end of the body. Other lines and
 * bad JSON are skipped. Abort through the request's signal: leaving the loop only releases the lock.
 */
export async function* readSse(res: Response): AsyncGenerator<unknown, void, unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";

  const payloads = function* (lines: string[]): Generator<unknown | typeof DONE> {
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        yield DONE;
        return;
      }
      try {
        yield JSON.parse(data) as unknown;
      } catch {
        // a malformed line: skip it
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // the last piece is a cut line until the body ends
      buffer = done ? "" : (lines.pop() ?? "");
      for (const payload of payloads(lines)) {
        if (payload === DONE) return;
        yield payload;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

const DONE = Symbol("done");
