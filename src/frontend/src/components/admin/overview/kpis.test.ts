import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import { TRACE_STATS } from "@/test/fixtures/admin";
import { formatMs, formatNumber, formatPercent, formatUsd } from "@/utils/format";
import { toKpis } from "./kpis";

const f = {
  formatNumber: (n: number) => formatNumber(n),
  formatMs: (ms: number) => formatMs(ms),
  formatUsd: (n: number) => formatUsd(n),
  formatPercent: (x: number) => formatPercent(x),
};

const byId = (kpis: ReturnType<typeof toKpis>) => Object.fromEntries(kpis.map((k) => [k.id, k]));

describe("toKpis", () => {
  it("maps totals and RAG metrics onto the seven tiles, in order", () => {
    const kpis = toKpis(TRACE_STATS, f, en.admin.overview.kpis, "—");
    expect(kpis.map((k) => k.id)).toEqual([
      "turns",
      "errorRate",
      "p95",
      "outputTokens",
      "cost",
      "noHit",
      "usedRetrieved",
    ]);

    const k = byId(kpis);
    expect(k.turns).toMatchObject({ value: "91", hint: "24 sessions, 2 users" });
    // Errors and cancelled turns both count against the rate: (3 + 11) / 91.
    expect(k.errorRate).toMatchObject({ value: "15.4%", hint: "3 errors, 11 cancelled" });
    expect(k.p95).toMatchObject({ value: "6.8 s", hint: "p50 2.2 s" });
    expect(k.outputTokens).toMatchObject({ value: "30,450", hint: "102,900 in" });
    expect(k.cost?.value).toBe("$0.20");
    expect(k.noHit?.value).toBe("5.2%");
    expect(k.usedRetrieved).toMatchObject({ value: "31%", hint: "1.8 searches per turn" });
  });

  it("reads an empty range as zeros and dashes, never NaN", () => {
    const empty = {
      ...TRACE_STATS,
      days: [],
      totals: {
        ...TRACE_STATS.totals,
        turns: 0,
        ok: 0,
        errors: 0,
        cancelled: 0,
        sessions: 0,
        subjects: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        latency_p50_ms: null,
        latency_p95_ms: null,
      },
      rag: {
        ...TRACE_STATS.rag,
        retrievals_per_turn: null,
        no_hit_rate: null,
        used_over_retrieved: null,
      },
    };
    const k = byId(toKpis(empty, f, en.admin.overview.kpis, "—"));
    expect(k.turns?.value).toBe("0");
    expect(k.errorRate?.value).toBe("0%");
    expect(k.p95?.value).toBe("—");
    expect(k.cost?.value).toBe("—");
    expect(k.noHit?.value).toBe("—");
    expect(k.usedRetrieved).toMatchObject({ value: "—", hint: "— searches per turn" });
    expect(JSON.stringify(k)).not.toContain("NaN");
  });
});
