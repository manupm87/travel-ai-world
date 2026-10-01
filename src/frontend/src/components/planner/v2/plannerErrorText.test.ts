import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import es from "@/i18n/es";
import { plannerErrorText } from "./plannerErrorText";

const context = { email: "ada@example.com", formatClock: () => "2:00 AM" };

describe("plannerErrorText (TRA-258)", () => {
  it("says nothing when no turn failed", () => {
    expect(plannerErrorText(en, { error: null, quotaResetsAt: null }, context)).toBeNull();
  });

  it("keeps the copy of the failures that were already there", () => {
    expect(plannerErrorText(en, { error: "generic", quotaResetsAt: null }, context)).toBe(en.plan.errors.generic);
    expect(plannerErrorText(en, { error: "unauthorized", quotaResetsAt: null }, context)).toBe(
      en.plan.errors.unauthorized
    );
  });

  it("names the local time a spent allowance resets at", () => {
    const seen: string[] = [];
    const text = plannerErrorText(
      en,
      { error: "quota", quotaResetsAt: "2026-10-02T00:00:00+00:00" },
      { ...context, formatClock: (iso) => (seen.push(iso), "2:00 AM") }
    );

    expect(text).toBe("You have used today's allowance. It resets at 2:00 AM.");
    expect(seen).toEqual(["2026-10-02T00:00:00+00:00"]);
    expect(
      plannerErrorText(es, { error: "quota", quotaResetsAt: "2026-10-02T00:00:00+00:00" }, { ...context, formatClock: () => "2:00" })
    ).toBe("Has usado el cupo de hoy. Se renueva a las 2:00.");
  });

  it("falls back to tomorrow when the reset time is missing or unreadable", () => {
    expect(plannerErrorText(en, { error: "quota", quotaResetsAt: null }, context)).toBe(en.plan.errors.quotaNoTime);
    expect(
      plannerErrorText(en, { error: "quota", quotaResetsAt: "soon" }, { ...context, formatClock: () => "" })
    ).toBe(en.plan.errors.quotaNoTime);
  });

  it("reads the no-access page's sentence for an account off the list", () => {
    expect(plannerErrorText(en, { error: "denied", quotaResetsAt: null }, context)).toBe(
      "Kyrian World is in a closed beta and the account ada@example.com hasn't been invited yet."
    );
    expect(plannerErrorText(en, { error: "denied", quotaResetsAt: null }, { ...context, email: null })).toBe(
      en.plan.errors.denied
    );
  });
});
