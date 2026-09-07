import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { locales } from "@/i18n";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe("LanguageContext", () => {
  it("starts in English", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe("en");
    expect(result.current.t).toBe(locales.en);
  });

  it("switches translations and the <html lang> attribute", () => {
    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => result.current.setLanguage("es"));

    expect(result.current.language).toBe("es");
    expect(result.current.t).toBe(locales.es);
    expect(document.documentElement.lang).toBe("es");
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useLanguage())).toThrow(
      /inside <LanguageProvider>/
    );
  });
});
