import type { PlannerState } from "@/hooks/plannerReducer";
import { interpolate, type Translations } from "@/i18n";

export interface PlannerErrorContext {
  /** The signed-in account's email, for the access-list sentence. */
  email: string | null;
  /** The local weekday and time of a timestamp (`useFormatters().formatWeekdayTime`). */
  formatWeekdayTime: (iso: string) => string;
}

/**
 * What the chat column says about the turn that failed, or `null` when none
 * did. A spent daily allowance names the local weekday and time it starts
 * again (ADR 0026: UTC midnight is the next day's small hours in Europe); an
 * account that is not on the access list reads the no-access page's sentence
 * and its way out.
 */
export function plannerErrorText(
  t: Translations,
  state: Pick<PlannerState, "error" | "quotaResetsAt">,
  { email, formatWeekdayTime }: PlannerErrorContext
): string | null {
  const errors = t.plan.errors;
  switch (state.error) {
    case null:
      return null;
    case "quota": {
      const when = state.quotaResetsAt ? formatWeekdayTime(state.quotaResetsAt) : "";
      return when ? interpolate(errors.quota, { when }) : errors.quotaNoTime;
    }
    case "denied":
      return email
        ? `${interpolate(t.auth.noAccess.description, { email })} ${t.auth.noAccess.hint}`
        : errors.denied;
    default:
      return errors[state.error];
  }
}
