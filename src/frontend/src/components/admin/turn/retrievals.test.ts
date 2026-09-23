import { describe, expect, it } from "vitest";
import { INSPECTOR_TURN } from "@/test/fixtures/admin-turn";
import { fetchCount, filterChips, parsePurpose, resultRows, retrievalViews } from "./retrievals";
import type { RetrievedDoc } from "./types";

const doc = (rank: number, distance: number | null, used = false): RetrievedDoc => ({
  doc_id: `doc-${rank}`,
  title: null,
  category: null,
  district: null,
  distance,
  rank,
  used,
});

describe("filterChips", () => {
  it("keeps only the filters that were set", () => {
    expect(
      filterChips({
        city: "budapest",
        districts: [],
        categories: ["see", "do"],
        kinds: [],
        price_tier_max: null,
        bbox: null,
      })
    ).toEqual([
      { key: "city", value: "budapest" },
      { key: "category", value: ["see", "do"] },
    ]);
  });

  it("adds district, kind and price when present, including a price of 0", () => {
    expect(
      filterChips({ city: null, districts: ["Belváros"], categories: [], kinds: ["poi"], price_tier_max: 0 })
    ).toEqual([
      { key: "district", value: ["Belváros"] },
      { key: "kind", value: ["poi"] },
      { key: "price", value: 0 },
    ]);
  });

  it("no filters at all is no chips", () => {
    expect(filterChips(null)).toEqual([]);
    expect(filterChips("nonsense")).toEqual([]);
  });
});

describe("resultRows", () => {
  it("scales every distance over the panel's farthest one, in rank order", () => {
    const rows = resultRows([doc(1, 0.5), doc(0, 0.25), doc(2, null)]);
    expect(rows.map((r) => [r.doc.rank, r.bar])).toEqual([
      [0, 0.5],
      [1, 1],
      [2, 0],
    ]);
  });

  it("all-null distances draw no bars", () => {
    expect(resultRows([doc(0, null)]).map((r) => r.bar)).toEqual([0]);
  });
});

describe("parsePurpose", () => {
  it("reads the day and part of a candidates search", () => {
    expect(parsePurpose("candidates:2:afternoon")).toEqual({ key: "candidatesDay", day: 2, part: "afternoon" });
  });

  it("names the others, and keeps an unknown one raw", () => {
    expect(parsePurpose("hotels")).toEqual({ key: "hotels" });
    expect(parsePurpose("candidates:Belváros")).toEqual({ key: "candidates" });
    expect(parsePurpose("mystery")).toEqual({ key: "other", raw: "mystery" });
    expect(parsePurpose(null)).toBeNull();
  });
});

describe("retrievalViews", () => {
  it("one view per search with its used count, k and embeddings model", () => {
    const views = retrievalViews(INSPECTOR_TURN.spans);
    expect(views).toHaveLength(9);
    expect(views.every((v, i, all) => i === 0 || all[i - 1]!.seq < v.seq)).toBe(true);
    const day2 = views.find((v) => v.seq === 10)!;
    expect(day2.used).toBe(3);
    expect(day2.k).toBe(8);
    expect(day2.rows).toHaveLength(8);
    expect(day2.embeddingModel).toBe("amazon.titan-embed-text-v2:0");
    expect(day2.chips.map((c) => c.key)).toEqual(["city", "category", "district"]);
  });

  it("a search that found nothing is a no-hit", () => {
    const [view] = retrievalViews([
      { ...INSPECTOR_TURN.spans.find((s) => s.seq === 6)!, results: [] },
    ]);
    expect(view!.noHit).toBe(true);
    expect(view!.used).toBe(0);
  });

  it("counts the fetches by id", () => {
    expect(fetchCount(INSPECTOR_TURN.spans)).toBe(1);
  });
});
