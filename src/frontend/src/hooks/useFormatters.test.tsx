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

  it("returns a stable object while the language is unchanged", () => {
    const { result, rerender } = renderHook(() => useFormatters(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(first.formatDuration(90)).toBe("1h 30m");
  });
});
