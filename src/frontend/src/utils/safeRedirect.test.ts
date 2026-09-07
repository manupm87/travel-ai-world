import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("accepts same-origin paths, decoding them first", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("%2Ftrip%2Fjapan%3Ftab%3D1")).toBe("/trip/japan?tab=1");
  });

  it("rejects empty values", () => {
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath("")).toBeNull();
  });

  it("rejects absolute URLs and protocol-relative paths", () => {
    expect(safeRedirectPath("https://evil.example")).toBeNull();
    expect(safeRedirectPath("//evil.example/x")).toBeNull();
    expect(safeRedirectPath("%2F%2Fevil.example")).toBeNull();
    expect(safeRedirectPath("/\\evil.example")).toBeNull();
    expect(safeRedirectPath("javascript:alert(1)")).toBeNull();
    expect(safeRedirectPath("dashboard")).toBeNull();
  });

  it("rejects values that fail to decode", () => {
    expect(safeRedirectPath("%E0%A4%A")).toBeNull();
  });
});
