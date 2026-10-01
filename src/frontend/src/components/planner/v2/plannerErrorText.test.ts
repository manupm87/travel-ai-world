import { describe, expect, it } from "vitest";
import en from "@/i18n/en";
import es from "@/i18n/es";
import { plannerErrorText } from "./plannerErrorText";

const context = { email: "ada@example.com", formatWeekdayTime: () => "Fri 2:00 AM" };

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

  it("names the local weekday and time a spent allowance starts again at", () => {
    const seen: string[] = [];
    const text = plannerErrorText(
      en,
      { error: "quota", quotaResetsAt: "2026-10-02T00:00:00+00:00" },
      { ...context, formatWeekdayTime: (iso) => (seen.push(iso), "Fri 2:00 AM") }
    );

    expect(text).toBe("You've reached today's planning limit. You can keep planning from Fri 2:00 AM.");
    expect(seen).toEqual(["2026-10-02T00:00:00+00:00"]);
    expect(
      plannerErrorText(es, { error: "quota", quotaResetsAt: "2026-10-02T00:00:00+00:00" }, { ...context, formatWeekdayTime: () => "vie, 2:00" })
    ).toBe("Has alcanzado el límite de uso de hoy. Podrás seguir planificando a partir del vie, 2:00.");
  });

  it("says to come back later when the reset time is missing or unreadable", () => {
    expect(plannerErrorText(en, { error: "quota", quotaResetsAt: null }, context)).toBe(en.plan.errors.quotaNoTime);
    expect(
      plannerErrorText(en, { error: "quota", quotaResetsAt: "soon" }, { ...context, formatWeekdayTime: () => "" })
    ).toBe(en.plan.errors.quotaNoTime);
  });

  it("reads the no-access page's sentence and its way out for an account off the list", () => {
    expect(plannerErrorText(en, { error: "denied", quotaResetsAt: null }, context)).toBe(
      "Kyrian World is in a closed beta and the account ada@example.com hasn't been invited yet. Ask the team to add this email, then check again."
    );
    expect(plannerErrorText(es, { error: "denied", quotaResetsAt: null }, context)).toBe(
      `Kyrian World está en beta cerrada y la cuenta ada@example.com aún no ha sido invitada. ${es.auth.noAccess.hint}`
    );
    expect(en.plan.errors.denied).toContain(en.auth.noAccess.hint);
    expect(es.plan.errors.denied).toContain(es.auth.noAccess.hint);
    expect(plannerErrorText(en, { error: "denied", quotaResetsAt: null }, { ...context, email: null })).toBe(
      en.plan.errors.denied
    );
  });
});
