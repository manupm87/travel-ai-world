import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LanguageProvider, useLanguage } from "@/context/LanguageContext";
import { useFormatters } from "./useFormatters";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe("useFormatters", () => {
  it("formats with the active language's locale and follows language changes", () => {
    const { result } = renderHook(
      () => ({ f: useFormatters(), lang: useLanguage() }),
      { wrapper }
    );

    expect(result.current.f.formatCurrency(1500, "EUR")).toBe("€1,500");
    expect(result.current.f.formatDate("2026-05-15T12:00:00Z", { month: "long", day: "numeric" })).toBe("May 15");

    act(() => result.current.lang.setLanguage("es"));

    // Intl separates the symbol with a non-breaking space in es-ES.
    expect(result.current.f.formatCurrency(1500, "EUR").replace(/ /g, " ")).toBe("1500 €");
    expect(result.current.f.formatDate("2026-05-15T12:00:00Z", { month: "long", day: "numeric" })).toBe("15 de mayo");
  });

  it("formats counts, latencies, dollars and ratios in the active locale", () => {
    const { result } = renderHook(
      () => ({ f: useFormatters(), lang: useLanguage() }),
      { wrapper }
    );
    const f = () => result.current.f;
    // Intl separates with a non-breaking (or narrow no-break) space in es-ES.
    const nbsp = (s: string) => s.replace(/[  ]/g, " ");

    expect(f().formatNumber(12345)).toBe("12,345");
    expect(f().formatMs(640)).toBe("640 ms");
    expect(f().formatMs(1234)).toBe("1.2 s");
    expect(f().formatMs(1000)).toBe("1.0 s");
    expect(f().formatUsd(1.5)).toBe("$1.50");
    expect(f().formatUsd(0.00123)).toBe("$0.0012");
    expect(f().formatUsd(0)).toBe("$0.00");
    expect(f().formatPercent(0.125)).toBe("12.5%");
    expect(f().formatPercent(0)).toBe("0%");

    act(() => result.current.lang.setLanguage("es"));

    expect(nbsp(f().formatNumber(12345))).toBe("12.345");
    expect(f().formatMs(1234)).toBe("1,2 s");
    expect(nbsp(f().formatUsd(1.5))).toBe("1,50 US$");
    expect(nbsp(f().formatPercent(0.125))).toBe("12,5 %");
  });

  it("returns a stable object while the language is unchanged", () => {
    const { result, rerender } = renderHook(() => useFormatters(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first.formatDuration(90)).toBe("1h 30m");
  });
});
