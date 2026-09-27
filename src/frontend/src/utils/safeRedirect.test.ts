import { describe, it, expect } from "vitest";
import { safeRedirectTarget } from "./safeRedirect";

describe("safeRedirectTarget", () => {
  it("accepts same-origin paths and returns them unchanged", () => {
    expect(safeRedirectTarget("/dashboard")).toBe("/dashboard");
    expect(safeRedirectTarget("/trip/japan?tab=1")).toBe("/trip/japan?tab=1");
    // Its own query stays encoded: a second decode would split the ask.
    expect(safeRedirectTarget("/plan/?q=a%26b")).toBe("/plan/?q=a%26b");
  });

  it("rejects empty values", () => {
    expect(safeRedirectTarget(null)).toBeNull();
    expect(safeRedirectTarget(undefined)).toBeNull();
    expect(safeRedirectTarget("")).toBeNull();
  });

  it("rejects absolute URLs and protocol-relative paths", () => {
    expect(safeRedirectTarget("https://evil.example")).toBeNull();
    expect(safeRedirectTarget("//evil.example/x")).toBeNull();
    expect(safeRedirectTarget("/\\evil.example")).toBeNull();
    expect(safeRedirectTarget("javascript:alert(1)")).toBeNull();
    expect(safeRedirectTarget("dashboard")).toBeNull();
  });

  it("rejects paths the URL parser turns into another origin", () => {
    // Tabs and newlines are dropped and `\` reads as `/`: all are `//evil.example`.
    expect(safeRedirectTarget("/\t/evil.example/login")).toBeNull();
    expect(safeRedirectTarget("/\n/evil.example/login")).toBeNull();
    expect(safeRedirectTarget("/\r/evil.example/login")).toBeNull();
    expect(safeRedirectTarget("/\t\\evil.example/login")).toBeNull();
  });
});
