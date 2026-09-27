import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { locales } from "@/i18n";
import { LANGUAGE_KEY } from "@/services/languagePreference";

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

  it("keeps the choice, so a new page opens in it (TRA-246)", () => {
    const first = renderHook(() => useLanguage(), { wrapper });
    act(() => first.result.current.setLanguage("es"));
    first.unmount();

    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("es");
    const { result } = renderHook(() => useLanguage(), { wrapper });
    expect(result.current.language).toBe("es");
    expect(result.current.resolved).toBe(true);
  });

  it("throws when used outside the provider", () => {
    expect(() => renderHook(() => useLanguage())).toThrow(
      /inside <LanguageProvider>/
    );
  });
});
