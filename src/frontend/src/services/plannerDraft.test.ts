import { describe, it, expect, vi, beforeEach } from "vitest";
import { initialPlannerState, toPlannerDraft, type PlannerDraft } from "@/hooks/plannerReducer";
import { clearPlannerDraft, PLANNER_DRAFT_KEY, readPlannerDraft, writePlannerDraft } from "./plannerDraft";

function draftWithMessages(): PlannerDraft {
  const draft = toPlannerDraft(initialPlannerState());
  return {
    ...draft,
    messages: [
      { id: "m1", kind: "text", role: "user", content: "5 days in Budapest" },
      { id: "m2", kind: "text", role: "assistant", content: "Great choice!" },
    ],
  };
}

describe("plannerDraft", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("round-trips a draft written then read", () => {
    const draft = draftWithMessages();

    writePlannerDraft(draft);

    expect(readPlannerDraft()).toEqual(draft);
  });

  it("returns null when nothing is stored", () => {
    expect(readPlannerDraft()).toBeNull();
  });

  it("returns null when the stored JSON is malformed", () => {
    sessionStorage.setItem(PLANNER_DRAFT_KEY, "{not json");

    expect(readPlannerDraft()).toBeNull();
  });

  it("returns null when the stored version differs from the current one", () => {
    const draft = draftWithMessages();
    sessionStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify({ version: 999, draft }));

    expect(readPlannerDraft()).toBeNull();
  });

  it("returns null after clear", () => {
    writePlannerDraft(draftWithMessages());

    clearPlannerDraft();

    expect(readPlannerDraft()).toBeNull();
  });

  it("does not throw when sessionStorage.setItem throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writePlannerDraft(draftWithMessages())).not.toThrow();

    setItem.mockRestore();
  });
});
