/**
 * Fills `{name}` placeholders in a translated template.
 *
 *   interpolate("Your {duration}-Day Journey", { duration: 7 })
 *   // "Your 7-Day Journey"
 *
 * Unknown placeholders are left untouched so a typo shows up in the UI
 * instead of silently disappearing.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}
