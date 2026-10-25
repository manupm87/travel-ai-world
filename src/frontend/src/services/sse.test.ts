import { describe, expect, it } from "vitest";
import { readSse } from "./sse";

/** A Response whose body streams the given text chunks. */
function sseResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body);
}

async function collect(res: Response): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const payload of readSse(res)) out.push(payload);
  return out;
}

describe("readSse", () => {
  it("parses every data line until [DONE], across cut chunks", async () => {
    const res = sseResponse(['data: {"n":', '1}\n\ndata: {"n":2}\n\n', "data: [DONE]\n\n", 'data: {"n":3}\n\n']);

    expect(await collect(res)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("skips other lines and bad JSON", async () => {
    const res = sseResponse([": keep-alive\n", "data: not json\n", 'event: x\ndata: {"ok":true}\n\n']);

    expect(await collect(res)).toEqual([{ ok: true }]);
  });

  it("reads a last line that has no newline", async () => {
    expect(await collect(sseResponse(['data: {"last":true}']))).toEqual([{ last: true }]);
  });

  it("throws when there is no body", async () => {
    await expect(collect(new Response(null))).rejects.toThrow("No response body");
  });
});
