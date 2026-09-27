import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LANGUAGE_KEY,
  browserLanguage,
  preferredLanguage,
  readStoredLanguage,
  subscribeLanguage,
  writeStoredLanguage,
} from "./languagePreference";

function stubBrowser(languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
}

describe("languagePreference (TRA-246)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(LANGUAGE_KEY);
  });

  it("keeps the traveller's choice across a reload", () => {
    writeStoredLanguage("es");

    expect(localStorage.getItem(LANGUAGE_KEY)).toBe("es");
    expect(readStoredLanguage()).toBe("es");
    expect(preferredLanguage()).toBe("es");
  });

  it("ignores a stored value the site does not ship", () => {
    localStorage.setItem(LANGUAGE_KEY, "fr");

    expect(readStoredLanguage()).toBeNull();
  });

  it("falls back to the first browser language the site ships, then to the default", () => {
    stubBrowser(["fr-FR", "es-ES", "en-US"]);
    expect(browserLanguage()).toBe("es");
    expect(preferredLanguage()).toBe("es");

    stubBrowser(["fr-FR", "de"]);
    expect(preferredLanguage()).toBe("en");
  });

  it("a stored choice wins over the browser", () => {
    stubBrowser(["es-ES"]);
    writeStoredLanguage("en");

    expect(preferredLanguage()).toBe("en");
  });

  it("tells subscribers when the choice changes, until they leave", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLanguage(listener);

    writeStoredLanguage("es");
    unsubscribe();
    writeStoredLanguage("en");

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
