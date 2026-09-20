"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { interpolate } from "@/i18n";
import { UnauthorizedError } from "@/services/http";
import { streamPlannerTurn } from "@/services/planner";
import {
  clearPlannerDraft,
  readPlannerDraft,
  writePlannerDraft,
} from "@/services/plannerDraft";
import type { PlannerTurn, Slot, TripBrief } from "@/types/planner";
import {
  groupForSlot,
  initialPlannerState,
  partOf,
  plannerReducer,
  toHistory,
  toItinerarySnapshot,
  toPlannerDraft,
  type PlannerAction,
  type PlannerState,
} from "./plannerReducer";

/** What the "Change" sheet asks for on top of the slot itself (TRA-184). */
export interface AskAlternativesOptions {
  /** Free text from the sheet's box: the search, in the traveller's words. */
  guidance?: string;
  /** "More options": the next page, on top of the cards already offered. */
  more?: boolean;
}

/** A turn as the callers describe it: the request's own fields minus the state. */
type TurnInput = Omit<
  PlannerTurn,
  "history" | "brief" | "itinerary" | "exclude_card_ids" | "trip_id"
> & { exclude_card_ids?: string[] };

/**
 * The planner page's brain: the pure reducer (`plannerReducer`) plus the
 * network and the browser draft.
 *
 * - Every turn (`sendMessage`, `select`, `remove`, `answer`) aborts the
 *   previous stream, sends the brief and the itinerary snapshot with it (the
 *   backend is stateless) and feeds the typed events to the reducer. Text
 *   deltas are coalesced into one commit per animation frame; structured
 *   events flush the pending text first, so order is kept.
 * - Selecting cards updates the itinerary at once (optimistic) and is sent
 *   as a structured `select` action; the server's next patch reconciles it.
 * - `askAlternatives` writes the "Change" sheet's ask: the slot, the free text
 *   the traveller typed, and the cards that ask already showed, so a second
 *   page never repeats the first (TRA-184).
 * - The draft is written to `sessionStorage` after every change and restored
 *   on mount, through `services/plannerDraft.ts` only.
 */
export function usePlanner() {
  const { t } = useLanguage();
  const [state, dispatch] = useReducer(plannerReducer, null, () =>
    initialPlannerState(readPlannerDraft())
  );

  /** Latest state, readable from the stable callbacks. */
  const stateRef = useRef<PlannerState>(state);
  useEffect(() => {
    stateRef.current = state;
    // Persist between turns only: a streaming turn commits once per frame,
    // and serialising the whole draft that often is wasted work. A pristine
    // state (after `reset`) clears the stored draft instead of saving it.
    if (state.status === "streaming") return;
    if (state.messages.length === 0 && Object.keys(state.groups).length === 0) {
      clearPlannerDraft();
    } else {
      writePlannerDraft(toPlannerDraft(state));
    }
  }, [state]);

  /** True once a turn was answered by the synthetic session (TRA-158). */
  const [demo, setDemo] = useState(false);
  const markDemo = useCallback(() => setDemo(true), []);

  const controllerRef = useRef<AbortController | null>(null);
  /** Streamed text not yet committed to React state (flushed once per frame). */
  const pendingTextRef = useRef("");
  const frameRef = useRef<number | null>(null);

  const flushText = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const delta = pendingTextRef.current;
    pendingTextRef.current = "";
    if (delta) dispatch({ type: "event", event: { type: "text", delta } });
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    pendingTextRef.current = "";
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  /**
   * Abort on unmount, one tick later: React's Strict Mode unmounts and
   * remounts once in development, and an immediate abort would kill the
   * first turn (`?q=`) for nothing. A remount within the tick cancels it.
   */
  const unmountAbortRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (unmountAbortRef.current !== null) {
      clearTimeout(unmountAbortRef.current);
      unmountAbortRef.current = null;
    }
    return () => {
      unmountAbortRef.current = setTimeout(abort, 0);
    };
  }, [abort]);

  /**
   * Applies `action` locally and immediately sends the turn it implies.
   * The reducer is pure, so the state the request is built from is computed
   * here rather than read back from React after a render.
   */
  const runTurn = useCallback(
    async (action: PlannerAction, turn: TurnInput) => {
      abort();
      const before = stateRef.current;
      const started = plannerReducer(before, action);
      // `sendMessage`'s action is the `turn_started` itself: apply it once.
      const next =
        action.type === "turn_started"
          ? started
          : plannerReducer(started, { type: "turn_started", message: turn.message });
      stateRef.current = next;
      dispatch(action);
      if (action.type !== "turn_started") {
        dispatch({ type: "turn_started", message: turn.message });
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      const request: PlannerTurn = {
        ...turn,
        // The transcript before this turn: the message itself travels in `message`.
        history: toHistory(before.messages),
        brief: next.brief,
        itinerary: toItinerarySnapshot(next.itinerary),
        // Nothing to rule out unless this ask already offered something.
        exclude_card_ids: turn.exclude_card_ids ?? [],
        trip_id: null,
      };

      try {
        for await (const event of streamPlannerTurn(request, {
          signal: controller.signal,
          onDemo: markDemo,
        })) {
          if (controller.signal.aborted) return;
          if (event.type === "text") {
            pendingTextRef.current += event.delta;
            frameRef.current ??= requestAnimationFrame(flushText);
          } else {
            flushText();
            dispatch({ type: "event", event });
          }
        }
        if (controller.signal.aborted) return;
        flushText();
        dispatch({ type: "turn_finished" });
      } catch (err) {
        // A cancelled stream (unmount, a newer turn) is not a failure.
        if (controller.signal.aborted) return;
        flushText();
        dispatch({
          type: "turn_failed",
          error: err instanceof UnauthorizedError ? "unauthorized" : "generic",
        });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [abort, flushText, markDemo]
  );

  /** Free text from the composer, the suggestion chips or the checklist. */
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void runTurn({ type: "turn_started", message: trimmed }, { message: trimmed, action: null });
    },
    [runTurn]
  );

  /** A quick reply: patches the brief locally, then tells the assistant in words. */
  const answer = useCallback(
    (patch: Partial<TripBrief>, text: string) => {
      void runTurn({ type: "brief_patched", patch }, { message: text, action: null });
    },
    [runTurn]
  );

  /**
   * Cards chosen in a carousel. `slot` is the day and the part the traveller
   * named for a group that carries none (TRA-185); a placed group sends `null`
   * and the server reads the slot out of the group id.
   */
  const select = useCallback(
    (groupId: string, cardIds: string[], slot?: Slot) => {
      if (cardIds.length === 0) return;
      const chosen = slot ?? null;
      void runTurn(
        { type: "selected", groupId, cardIds, slot: chosen },
        {
          message: null,
          action: {
            type: "select",
            group_id: groupId,
            card_ids: cardIds,
            slot: chosen,
          },
        }
      );
    },
    [runTurn]
  );

  /** An activity taken out of a slot. */
  const remove = useCallback(
    (slot: Slot, cardId: string) => {
      void runTurn(
        { type: "removed", slot, cardId },
        { message: null, action: { type: "remove", slot, card_id: cardId } }
      );
    },
    [runTurn]
  );

  /**
   * The "Change" sheet's ask for one slot, in the reader's language.
   *
   * `guidance` becomes the search itself ("Alternatives for day 2 · afternoon:
   * a thermal bath") and starts the list over; `more` keeps the cards on screen
   * and sends their ids so the server offers three others.
   */
  const askAlternatives = useCallback(
    (slot: Slot, { guidance, more = false }: AskAlternativesOptions = {}) => {
      const a = t.plan.alternatives;
      const part = t.plan.parts[partOf(slot)];
      const asked = guidance?.trim();
      const message = asked
        ? interpolate(a.askMessageGuided, { day: slot.day, part, guidance: asked })
        : interpolate(a.askMessage, { day: slot.day, part });
      const group = groupForSlot(stateRef.current.groups, slot);
      void runTurn(
        // A guided ask empties the carousel; the plain one only starts a turn.
        asked && group
          ? { type: "group_cleared", groupId: group.group_id }
          : { type: "turn_started", message },
        {
          message,
          action: null,
          exclude_card_ids: more && group ? group.cards.map((card) => card.id) : [],
        }
      );
    },
    [runTurn, t]
  );

  const dismiss = useCallback((groupId: string, cardId: string) => {
    dispatch({ type: "dismissed", groupId, cardId });
  }, []);

  const toggleShortlist = useCallback((cardId: string) => {
    dispatch({ type: "shortlist_toggled", cardId });
  }, []);

  const reset = useCallback(() => {
    abort();
    dispatch({ type: "reset" }); // the persist effect clears the stored draft
  }, [abort]);

  return {
    state,
    demo,
    sendMessage,
    answer,
    select,
    remove,
    askAlternatives,
    dismiss,
    toggleShortlist,
    reset,
    abort,
  };
}

export type UsePlannerResult = ReturnType<typeof usePlanner>;
