import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/context/LanguageContext";
import en from "@/i18n/en";
import { interpolate } from "@/i18n";
import { UnauthorizedError } from "@/services/http";
import { streamPlannerTurn, type StreamPlannerOptions } from "@/services/planner";
import {
  clearPlannerDraft,
  readPlannerDraft,
  writePlannerDraft,
  writeSavedTripId,
} from "@/services/plannerDraft";
import {
  BATHS,
  BRIEF_AFTER_FIRST_MESSAGE,
  GROUP_IDS,
  HOTELS,
  TURNS,
  USER_MESSAGES,
} from "@/data/planner-demo/session";
import { BRIEF_FIELDS, EMPTY_BRIEF, type PlannerEvent, type PlannerTurn } from "@/types/planner";
import { EMPTY_ITINERARY, type PlannerDraft } from "./plannerReducer";
import { usePlanner } from "./usePlanner";

vi.mock("@/services/planner", () => ({
  streamPlannerTurn: vi.fn(),
}));

vi.mock("@/services/plannerDraft", () => ({
  readPlannerDraft: vi.fn(),
  writePlannerDraft: vi.fn(),
  clearPlannerDraft: vi.fn(),
  writeSavedTripId: vi.fn(),
}));

const streamPlannerTurnMock = vi.mocked(streamPlannerTurn);
const readPlannerDraftMock = vi.mocked(readPlannerDraft);
const writePlannerDraftMock = vi.mocked(writePlannerDraft);
const clearPlannerDraftMock = vi.mocked(clearPlannerDraft);
const writeSavedTripIdMock = vi.mocked(writeSavedTripId);

/** Turns a fixed array of events into a mocked stream implementation. */
function streamOf(events: readonly PlannerEvent[]) {
  return async function* (): AsyncGenerator<PlannerEvent, void, unknown> {
    for (const event of events) yield event;
  };
}

/** The hook reads its copy from the language context, as any client hook does. */
function wrapper({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

/** A promise the test settles by hand, to gate a mocked stream mid-flight. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  readPlannerDraftMock.mockReturnValue(null);
  streamPlannerTurnMock.mockImplementation(streamOf([{ type: "done" }]));
  // Deterministic frame scheduling, as in PlannerCard.test.tsx.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePlanner — sendMessage", () => {
  it("sends the message, action null, the current brief, the itinerary snapshot, trip_id null and an abort signal", async () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage(USER_MESSAGES.opening);
    });

    await waitFor(() => expect(streamPlannerTurnMock).toHaveBeenCalledTimes(1));
    const [turn, options] = streamPlannerTurnMock.mock.calls[0] as [
      PlannerTurn,
      { signal: AbortSignal },
    ];
    expect(turn.message).toBe(USER_MESSAGES.opening);
    expect(turn.action).toBeNull();
    expect(turn.brief).toEqual(EMPTY_BRIEF);
    expect(turn.itinerary).toEqual({ stay_card_id: null, days: [] });
    expect(turn.trip_id).toBeNull();
    expect(options.signal).toBeInstanceOf(AbortSignal);

    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });

  it("does not duplicate the message just sent into history", async () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage(USER_MESSAGES.opening);
    });

    await waitFor(() => expect(streamPlannerTurnMock).toHaveBeenCalledTimes(1));
    const [turn] = streamPlannerTurnMock.mock.calls[0] as [PlannerTurn, unknown];
    expect(turn.history).toEqual([]);

    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });

  it("applies the opening turn's events: concatenated assistant text, brief and missing, then idle", async () => {
    streamPlannerTurnMock.mockImplementationOnce(streamOf(TURNS.opening));
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage(USER_MESSAGES.opening);
    });

    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    expect(result.current.state.messages).toEqual([
      { id: "m1", kind: "text", role: "user", content: USER_MESSAGES.opening },
      {
        id: "m2",
        kind: "text",
        role: "assistant",
        content:
          "Good plan! Late October is a great time for the thermal baths. Which dates suit you best?",
      },
    ]);
    expect(result.current.state.brief).toEqual(BRIEF_AFTER_FIRST_MESSAGE);
    expect(result.current.state.missing).toEqual(["dates"]);
  });
});

describe("usePlanner — answer", () => {
  it("patches the brief before the request is built and drops the field from missing", async () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.answer({ destination: "Budapest" }, "Budapest, please");
    });

    expect(streamPlannerTurnMock).toHaveBeenCalledTimes(1);
    const [turn] = streamPlannerTurnMock.mock.calls[0] as [PlannerTurn, unknown];
    expect(turn.message).toBe("Budapest, please");
    expect(turn.brief).toEqual({ ...EMPTY_BRIEF, destination: "Budapest" });
    expect(result.current.state.brief.destination).toBe("Budapest");
    expect(result.current.state.missing).toEqual(["origin", "dates", "travellers", "interests"]);

    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });
});

describe("usePlanner — askAlternatives (TRA-184)", () => {
  const SLOT = { day: 2, part: "afternoon" } as const;
  const a = en.plan.alternatives;
  const part = en.plan.parts.afternoon;

  /** A carousel for the slot, the way the server's turn leaves it. */
  const offered: PlannerEvent[] = [
    {
      type: "options",
      group_id: "slot:2:afternoon",
      kind: "experience",
      prompt: "Alternatives",
      slot: { day: 2, part: "afternoon" },
      selection: "single",
      cards: [BATHS.rudas, BATHS.szechenyi],
    },
    { type: "done" },
  ];

  async function withGroup() {
    streamPlannerTurnMock.mockImplementationOnce(streamOf(offered));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.askAlternatives(SLOT);
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
    return result;
  }

  it("asks for the slot in the reader's language, ruling nothing out", async () => {
    const result = await withGroup();

    const [turn] = streamPlannerTurnMock.mock.calls[0] as [PlannerTurn, unknown];
    expect(turn.message).toBe(interpolate(a.askMessage, { day: 2, part }));
    expect(turn.exclude_card_ids).toEqual([]);
    expect(result.current.state.groups["slot:2:afternoon"]?.cards).toHaveLength(2);
  });

  it("More options sends the ids already offered and keeps them on screen", async () => {
    const result = await withGroup();

    act(() => {
      result.current.askAlternatives(SLOT, { more: true });
    });

    await waitFor(() => expect(streamPlannerTurnMock).toHaveBeenCalledTimes(2));
    const [turn] = streamPlannerTurnMock.mock.calls[1] as [PlannerTurn, unknown];
    expect(turn.message).toBe(interpolate(a.askMessage, { day: 2, part }));
    expect(turn.exclude_card_ids).toEqual([BATHS.rudas.id, BATHS.szechenyi.id]);
    expect(result.current.state.groups["slot:2:afternoon"]?.cards).toHaveLength(2);
  });

  it("a guided ask carries the words, empties the list and rules nothing out", async () => {
    const result = await withGroup();

    act(() => {
      result.current.askAlternatives(SLOT, { guidance: "  a thermal bath  " });
    });

    await waitFor(() => expect(streamPlannerTurnMock).toHaveBeenCalledTimes(2));
    const [turn] = streamPlannerTurnMock.mock.calls[1] as [PlannerTurn, unknown];
    expect(turn.message).toBe(
      interpolate(a.askMessageGuided, { day: 2, part, guidance: "a thermal bath" })
    );
    expect(turn.exclude_card_ids).toEqual([]);
    expect(result.current.state.groups["slot:2:afternoon"]?.cards).toEqual([]);
  });
});

describe("usePlanner — select", () => {
  it("sends a select action with no message, adds the chip and sets the stay optimistically before the stream yields", async () => {
    streamPlannerTurnMock.mockImplementationOnce(streamOf(TURNS.neighbourhood));
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.sendMessage("Somewhere to stay?");
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
    expect(result.current.state.groups[GROUP_IDS.hotels]).toBeDefined();

    const gate = deferred<void>();
    streamPlannerTurnMock.mockImplementationOnce(async function* () {
      await gate.promise;
      yield { type: "done" } as PlannerEvent;
    });

    act(() => {
      result.current.select(GROUP_IDS.hotels, [HOTELS.rum.id]);
    });

    // Before the (gated) stream has yielded anything at all. The selection
    // chip lands right before the fresh (empty) assistant bubble the turn
    // opens for the upcoming response.
    expect(result.current.state.itinerary.stay).toEqual(HOTELS.rum);
    const messages = result.current.state.messages;
    expect(messages.at(-2)).toEqual({
      id: expect.any(String),
      kind: "selection",
      titles: [HOTELS.rum.title],
    });
    expect(messages.at(-1)).toMatchObject({ kind: "text", role: "assistant", content: "" });
    expect(result.current.state.groups[GROUP_IDS.hotels]?.selectedIds).toEqual([HOTELS.rum.id]);
    const [turn] = streamPlannerTurnMock.mock.calls.at(-1) as [PlannerTurn, unknown];
    expect(turn.message).toBeNull();
    expect(turn.action).toEqual({
      type: "select",
      group_id: GROUP_IDS.hotels,
      card_ids: [HOTELS.rum.id],
      // A hotel group places its own pick: no slot for the traveller to name.
      slot: null,
    });

    act(() => gate.resolve());
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });

  it("sends the slot the traveller named for an unplaced group (TRA-185)", async () => {
    streamPlannerTurnMock.mockImplementationOnce(async function* () {
      yield {
        type: "options",
        group_id: "found:1a2b3c4d",
        kind: "experience",
        prompt: "Add any of these to your trip:",
        slot: null,
        selection: "single",
        cards: [BATHS.rudas],
      } as PlannerEvent;
      yield { type: "done" } as PlannerEvent;
    });
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.sendMessage("Is there something at Margaret Island?");
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    streamPlannerTurnMock.mockImplementationOnce(async function* () {
      yield { type: "done" } as PlannerEvent;
    });
    act(() => {
      result.current.select("found:1a2b3c4d", [BATHS.rudas.id], { day: 2, part: "evening" });
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    const [turn] = streamPlannerTurnMock.mock.calls.at(-1) as [PlannerTurn, unknown];
    expect(turn.action).toEqual({
      type: "select",
      group_id: "found:1a2b3c4d",
      card_ids: [BATHS.rudas.id],
      slot: { day: 2, part: "evening" },
    });
    expect(
      result.current.state.itinerary.days.find((d) => d.day === 2)?.slots.evening
    ).toEqual([BATHS.rudas]);
  });
});

describe("usePlanner — concurrent turns", () => {
  it("a new turn aborts the previous stream's signal, and its later events are not applied", async () => {
    let signalA: AbortSignal | undefined;
    const gateA = deferred<void>();
    streamPlannerTurnMock.mockImplementationOnce(async function* (
      _turn: PlannerTurn,
      opts: StreamPlannerOptions = {}
    ) {
      signalA = opts.signal;
      yield { type: "text", delta: "partial A" };
      await gateA.promise;
      yield { type: "text", delta: " more A" };
      yield { type: "done" };
    });
    streamPlannerTurnMock.mockImplementationOnce(
      streamOf([{ type: "text", delta: "B" }, { type: "done" }])
    );

    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage("first");
    });
    await waitFor(() => expect(signalA).toBeDefined());
    await waitFor(() =>
      expect(result.current.state.messages.at(-1)).toMatchObject({ content: "partial A" })
    );

    act(() => {
      result.current.sendMessage("second");
    });
    expect(signalA?.aborted).toBe(true);

    act(() => gateA.resolve());
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    const texts = result.current.state.messages
      .filter((m): m is Extract<typeof m, { kind: "text" }> => m.kind === "text")
      .map((m) => m.content);
    expect(texts.some((t) => t.includes("more A"))).toBe(false);
    expect(result.current.state.messages.at(-1)).toMatchObject({
      kind: "text",
      role: "assistant",
      content: "B",
    });
  });

  it("an aborted stream's rejection is not treated as an error", async () => {
    let signalA: AbortSignal | undefined;
    const gateA = deferred<void>();
    streamPlannerTurnMock.mockImplementationOnce(async function* (
      _turn: PlannerTurn,
      opts: StreamPlannerOptions = {}
    ) {
      signalA = opts.signal;
      yield { type: "text", delta: "partial A" };
      await gateA.promise;
      throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    });
    streamPlannerTurnMock.mockImplementationOnce(streamOf([{ type: "done" }]));

    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage("first");
    });
    await waitFor(() => expect(signalA).toBeDefined());
    await waitFor(() =>
      expect(result.current.state.messages.at(-1)).toMatchObject({ content: "partial A" })
    );

    act(() => {
      result.current.sendMessage("second");
    });
    expect(signalA?.aborted).toBe(true);

    act(() => gateA.resolve());
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
    expect(result.current.state.error).toBeNull();
  });
});

describe("usePlanner — failures", () => {
  it("a stream rejected with UnauthorizedError sets status error with error unauthorized", async () => {
    streamPlannerTurnMock.mockImplementation(async function* () {
      throw new UnauthorizedError();
    });
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state.error).toBe("unauthorized");
  });

  it("a stream rejected with any other error sets status error with error generic", async () => {
    streamPlannerTurnMock.mockImplementation(async function* () {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state.error).toBe("generic");
  });
});

describe("usePlanner — draft persistence", () => {
  it("writes the draft after state changes, with only the draft's own keys", async () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.sendMessage("hello");
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    expect(writePlannerDraftMock).toHaveBeenCalled();
    const lastDraft = writePlannerDraftMock.mock.calls.at(-1)?.[0] as PlannerDraft;
    expect(Object.keys(lastDraft).sort()).toEqual(
      ["brief", "groups", "itinerary", "messages", "missing", "shortlist"].sort()
    );
  });

  it("restores a stored draft on mount", () => {
    const draft: PlannerDraft = {
      messages: [{ id: "m1", kind: "text", role: "user", content: "restored" }],
      groups: {},
      brief: EMPTY_BRIEF,
      missing: [...BRIEF_FIELDS],
      itinerary: EMPTY_ITINERARY,
      shortlist: [],
    };
    readPlannerDraftMock.mockReturnValue(draft);

    const { result } = renderHook(() => usePlanner(), { wrapper });

    expect(result.current.state.messages).toEqual(draft.messages);
    expect(result.current.state.status).toBe("idle");
  });

  it("startNew clears the draft, the saved trip and the state", async () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.sendMessage("hello");
    });
    await waitFor(() => expect(result.current.state.status).toBe("idle"));

    // A pristine state clears the stored draft instead of saving it (also on mount).
    const clearsBefore = clearPlannerDraftMock.mock.calls.length;
    act(() => {
      result.current.startNew();
    });

    expect(clearPlannerDraftMock.mock.calls.length).toBeGreaterThan(clearsBefore);
    expect(result.current.state).toMatchObject({ messages: [], status: "idle", turn: 0 });
  });

  it("hydrate replaces the state with a saved trip and remembers which one", () => {
    const draft: PlannerDraft = {
      messages: [],
      groups: {},
      brief: { ...EMPTY_BRIEF, destination: "Budapest" },
      missing: [],
      itinerary: { ...EMPTY_ITINERARY, stay: HOTELS.rum },
      shortlist: [],
    };
    const { result } = renderHook(() => usePlanner(), { wrapper });

    act(() => {
      result.current.hydrate(draft, "trip-1");
    });

    expect(result.current.state.brief.destination).toBe("Budapest");
    expect(result.current.state.itinerary.stay).toEqual(HOTELS.rum);
    expect(writeSavedTripIdMock).toHaveBeenCalledWith("trip-1");
  });

  it("keeps a hydrated trip in the tab draft although it has no messages", async () => {
    const draft: PlannerDraft = {
      messages: [],
      groups: {},
      brief: { ...EMPTY_BRIEF, destination: "Budapest" },
      missing: [],
      itinerary: { ...EMPTY_ITINERARY, stay: HOTELS.rum },
      shortlist: [],
    };
    const { result } = renderHook(() => usePlanner(), { wrapper });
    writePlannerDraftMock.mockClear();
    clearPlannerDraftMock.mockClear();

    act(() => {
      result.current.hydrate(draft, "trip-1");
    });

    await waitFor(() => expect(writePlannerDraftMock).toHaveBeenCalled());
    expect(clearPlannerDraftMock).not.toHaveBeenCalled();
  });
});

describe("usePlanner — unmount", () => {
  it("aborts an in-flight stream", async () => {
    let signal: AbortSignal | undefined;
    const gate = deferred<void>();
    streamPlannerTurnMock.mockImplementationOnce(async function* (
      _turn: PlannerTurn,
      opts: StreamPlannerOptions = {}
    ) {
      signal = opts.signal;
      yield { type: "text", delta: "start" };
      await gate.promise;
      yield { type: "done" };
    });

    const { result, unmount } = renderHook(() => usePlanner(), { wrapper });
    act(() => {
      result.current.sendMessage("hello");
    });
    await waitFor(() => expect(signal).toBeDefined());

    unmount();
    expect(signal?.aborted).toBe(false); // deferred one tick, so Strict Mode's churn can cancel it

    // The abort is scheduled with a real setTimeout(fn, 0) in the cleanup,
    // not through the stubbed requestAnimationFrame, so advance real time.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(signal?.aborted).toBe(true);
    gate.resolve();
  });
});
