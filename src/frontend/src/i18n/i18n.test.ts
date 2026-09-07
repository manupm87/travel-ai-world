import { describe, it, expect } from "vitest";
import { LANGUAGES, getLanguageMeta, interpolate, locales } from "@/i18n";
import { TRIP_STATUSES } from "@/types/trip-summary";

/** Every dotted leaf path of an object, arrays included as `[]`. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.length === 0 ? [`${prefix}[]`] : leafPaths(value[0], `${prefix}[]`);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [prefix];
}

describe("i18n", () => {
  it("lists metadata for exactly the languages that have a locale", () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(Object.keys(locales).sort());
  });

  it("gives every language a distinct flag, native name and BCP 47 locale", () => {
    for (const key of ["flag", "nativeName", "locale"] as const) {
      const values = LANGUAGES.map((l) => l[key]);
      expect(new Set(values).size).toBe(values.length);
    }
    for (const { locale } of LANGUAGES) {
      expect(() => new Intl.DateTimeFormat(locale)).not.toThrow();
    }
  });

  it("resolves metadata by code", () => {
    expect(getLanguageMeta("es")).toMatchObject({ flag: "🇪🇸", locale: "es-ES" });
  });

  it("keeps the same key structure in every locale", () => {
    const reference = leafPaths(locales.en).sort();
    for (const [code, dictionary] of Object.entries(locales)) {
      expect(leafPaths(dictionary).sort(), `locale ${code}`).toEqual(reference);
    }
  });

  it("has a status label and a dashboard section for every trip status", () => {
    for (const dictionary of Object.values(locales)) {
      expect(Object.keys(dictionary.status).sort()).toEqual([...TRIP_STATUSES].sort());
      expect(Object.keys(dictionary.dashboard.sections).sort()).toEqual([...TRIP_STATUSES].sort());
    }
  });

  it("has no empty strings", () => {
    for (const [code, dictionary] of Object.entries(locales)) {
      const empty = leafPaths(dictionary).filter((path) => {
        const value = path
          .split(".")
          .reduce<unknown>((acc, key) => {
            if (key.endsWith("[]")) {
              const arr = (acc as Record<string, unknown[]>)[key.slice(0, -2)];
              return arr[0];
            }
            return (acc as Record<string, unknown>)[key];
          }, dictionary);
        return value === "";
      });
      expect(empty, `locale ${code}`).toEqual([]);
    }
  });

  describe("interpolate", () => {
    it("substitutes named placeholders", () => {
      expect(interpolate("Your {duration}-Day Journey", { duration: 7 })).toBe(
        "Your 7-Day Journey"
      );
      expect(interpolate("{a} and {b} and {a}", { a: "x", b: "y" })).toBe("x and y and x");
    });

    it("leaves unknown placeholders visible", () => {
      expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
    });
  });
});
