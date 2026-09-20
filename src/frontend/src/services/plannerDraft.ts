/**
 * The planner's per-tab draft, kept in `sessionStorage` so a reload does not
 * lose the conversation and the itinerary being built, and the id of the trip
 * that draft was last saved as (TRA-191), so a second "Save trip" rewrites
 * that trip instead of leaving a second one behind. Keeping the two in step
 * while the traveller plans is the follow-up (TRA-146); this is the
 * browser-side safety net, and the one module that touches the storage.
 */

import type { PlannerDraft } from "@/hooks/plannerReducer";

export const PLANNER_DRAFT_KEY = "travel_ai_planner_draft";

/** Bumped whenever the persisted shape changes; older drafts are dropped. */
const DRAFT_VERSION = 1;

interface StoredDraft {
  version: number;
  draft: PlannerDraft;
}

/** The reducer indexes into these at once; a draft without them cannot be restored. */
function hasDraftShape(draft: unknown): draft is PlannerDraft {
  if (typeof draft !== "object" || draft === null) return false;
  const d = draft as Record<string, unknown>;
  return (
    Array.isArray(d.messages) &&
    typeof d.groups === "object" &&
    d.groups !== null &&
    typeof d.brief === "object" &&
    d.brief !== null &&
    Array.isArray((d.brief as Record<string, unknown>).interests) &&
    Array.isArray(d.missing) &&
    typeof d.itinerary === "object" &&
    d.itinerary !== null &&
    Array.isArray((d.itinerary as Record<string, unknown>).days) &&
    Array.isArray(d.shortlist)
  );
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null; // privacy mode or disabled storage
  }
}

/** The draft saved in this tab, or `null` when absent, stale or unreadable. */
export function readPlannerDraft(): PlannerDraft | null {
  const raw = storage()?.getItem(PLANNER_DRAFT_KEY) ?? null;
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (!stored || stored.version !== DRAFT_VERSION || !hasDraftShape(stored.draft)) return null;
    return stored.draft;
  } catch {
    return null;
  }
}

export function writePlannerDraft(draft: PlannerDraft): void {
  const stored: StoredDraft = { version: DRAFT_VERSION, draft };
  try {
    storage()?.setItem(PLANNER_DRAFT_KEY, JSON.stringify(stored));
  } catch {
    // Quota exceeded or storage disabled: the in-memory state still works.
  }
}

const SAVED_TRIP_KEY = "travel_ai_planner_trip_id";

/** The trip this tab's draft was saved as, or `null` when it never was. */
export function readSavedTripId(): string | null {
  return storage()?.getItem(SAVED_TRIP_KEY) ?? null;
}

export function writeSavedTripId(id: string): void {
  try {
    storage()?.setItem(SAVED_TRIP_KEY, id);
  } catch {
    // Storage disabled: the next save creates a second trip, nothing breaks.
  }
}

const DEMO_BANNER_KEY = "travel_ai_planner_demo_banner";

/** True once the demo banner was dismissed in this tab. */
export function isDemoBannerDismissed(): boolean {
  return storage()?.getItem(DEMO_BANNER_KEY) === "dismissed";
}

export function dismissDemoBanner(): void {
  try {
    storage()?.setItem(DEMO_BANNER_KEY, "dismissed");
  } catch {
    // Storage disabled: the banner comes back on reload, which is fine.
  }
}

/** "Start over": the draft goes, and with it the trip it was saved as. */
export function clearPlannerDraft(): void {
  try {
    storage()?.removeItem(PLANNER_DRAFT_KEY);
    storage()?.removeItem(SAVED_TRIP_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
