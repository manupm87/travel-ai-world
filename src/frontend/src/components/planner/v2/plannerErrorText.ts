import type { PlannerState } from "@/hooks/plannerReducer";
import { interpolate, type Translations } from "@/i18n";

export interface PlannerErrorContext {
  /** The signed-in account's email, for the access-list sentence. */
  email: string | null;
  /** The local hour and minute of a timestamp (`useFormatters().formatClock`). */
  formatClock: (iso: string) => string;
}

/**
 * What the chat column says about the turn that failed, or `null` when none
 * did. A spent daily allowance names the local time it starts again
 * (ADR 0026); an account that is not on the access list reads the sentence of
 * the no-access page.
 */
export function plannerErrorText(
  t: Translations,
  state: Pick<PlannerState, "error" | "quotaResetsAt">,
  { email, formatClock }: PlannerErrorContext
): string | null {
  const errors = t.plan.errors;
  switch (state.error) {
    case null:
      return null;
    case "quota": {
      const time = state.quotaResetsAt ? formatClock(state.quotaResetsAt) : "";
      return time ? interpolate(errors.quota, { time }) : errors.quotaNoTime;
    }
    case "denied":
      return email ? interpolate(t.auth.noAccess.description, { email }) : errors.denied;
    default:
      return errors[state.error];
  }
}
