import { describe, it, expect, vi, beforeEach } from "vitest";
import { initialPlannerState, toPlannerDraft, type PlannerDraft } from "@/hooks/plannerReducer";
import {
  clearPlannerDraft,
  PLANNER_DRAFT_KEY,
  readPlannerDraft,
  readPlannerSessionId,
  readSavedTripId,
  writePlannerDraft,
  writePlannerSessionId,
  writeSavedTripId,
} from "./plannerDraft";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

  it("remembers the trip this tab's draft was saved as", () => {
    expect(readSavedTripId()).toBeNull();

    writeSavedTripId("t1");

    expect(readSavedTripId()).toBe("t1");
  });

  it("forgets that trip when the draft is cleared: starting over starts a new trip", () => {
    writePlannerDraft(draftWithMessages());
    writeSavedTripId("t1");

    clearPlannerDraft();

    expect(readSavedTripId()).toBeNull();
  });

  it("stores the draft with its session id", () => {
    writePlannerDraft(draftWithMessages(), "s-1");

    expect(JSON.parse(sessionStorage.getItem(PLANNER_DRAFT_KEY) ?? "{}")).toMatchObject({
      version: 2,
      sessionId: "s-1",
    });
    expect(readPlannerSessionId()).toBe("s-1");
  });

  it("keeps the stored session id when a draft is written without one", () => {
    writePlannerDraft(draftWithMessages(), "s-1");

    writePlannerDraft(draftWithMessages());

    expect(readPlannerSessionId()).toBe("s-1");
  });

  it("gives a stored draft without a session id a new one, and keeps it", () => {
    const draft = draftWithMessages();
    sessionStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify({ version: 2, draft }));

    const id = readPlannerSessionId();

    expect(id).toMatch(UUID);
    expect(readPlannerSessionId()).toBe(id);
    expect(readPlannerDraft()).toEqual(draft);
  });

  it("has no session id without a draft", () => {
    expect(readPlannerSessionId()).toBeNull();
  });

  it("moves the stored draft to another session", () => {
    writePlannerDraft(draftWithMessages(), "s-1");

    writePlannerSessionId("s-2");

    expect(readPlannerSessionId()).toBe("s-2");
  });

  it("drops a version 1 draft", () => {
    const draft = draftWithMessages();
    sessionStorage.setItem(PLANNER_DRAFT_KEY, JSON.stringify({ version: 1, draft }));

    expect(readPlannerDraft()).toBeNull();
    expect(readPlannerSessionId()).toBeNull();
  });

  it("does not throw when sessionStorage.setItem throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(() => writePlannerDraft(draftWithMessages())).not.toThrow();

    setItem.mockRestore();
  });
});
