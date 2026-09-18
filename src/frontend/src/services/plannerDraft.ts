/**
 * The planner's per-tab draft, kept in `sessionStorage` so a reload does not
 * lose the conversation and the itinerary being built. Persisting the draft
 * as a real trip in core_api is a separate issue (TRA-146); this is only the
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

export function clearPlannerDraft(): void {
  try {
    storage()?.removeItem(PLANNER_DRAFT_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
