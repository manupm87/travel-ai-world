/**
 * The planner page's state machine, as a pure reducer so every transition
 * (streamed events, optimistic selections, itinerary patches) is unit-tested
 * without React. `usePlanner` drives it and owns the network.
 */

import {
  BRIEF_FIELDS,
  DAY_PARTS,
  EMPTY_BRIEF,
  type BriefField,
  type ChatMessage,
  type DayPart,
  type DayWeather,
  type ItineraryOp,
  type ItinerarySnapshot,
  type OptionCard,
  type OptionsGroup,
  type PlannerEvent,
  type RouteInfo,
  type Slot,
  type TripBrief,
  type WarnCode,
} from "@/types/planner";

// ─── State ────────────────────────────────────────────────────────────────────

export type PlannerMessage =
  | { id: string; kind: "text"; role: "user" | "assistant"; content: string }
  /** A carousel; the group itself lives in `groups` so selections update in place. */
  | { id: string; kind: "options"; groupId: string }
  /** "Chosen: Széchenyi": what the user picked, as a chip in the transcript. */
  | { id: string; kind: "selection"; titles: string[] };

export interface OptionGroupState extends OptionsGroup {
  selectedIds: string[];
  /** "Not interested": hidden locally, nothing is sent (phase 1). */
  dismissedIds: string[];
}

export interface ItineraryWarning {
  slot: Slot | null;
  code: WarnCode;
  message: string;
}

export interface DayDraft {
  day: number;
  title: string | null;
  weather: DayWeather | null;
  slots: Record<DayPart, OptionCard[]>;
}

export interface ItineraryDraft {
  stay: OptionCard | null;
  /** Sorted by day number; a day exists once any op mentions it. */
  days: DayDraft[];
  route: RouteInfo | null;
  warnings: ItineraryWarning[];
}

export type PlannerStatus = "idle" | "streaming" | "error";

/** Why the last turn failed; the UI maps it to translated copy. */
export type PlannerErrorKind = "unauthorized" | "generic";

/** What survives a reload (`services/plannerDraft.ts`). */
export interface PlannerDraft {
  messages: PlannerMessage[];
  groups: Record<string, OptionGroupState>;
  brief: TripBrief;
  missing: BriefField[];
  itinerary: ItineraryDraft;
  /** Hearts: local only, never sent. */
  shortlist: string[];
}

/**
 * "Packing the suitcase" (TRA-239, TRA-242): how far the turn on its way has
 * got. ai_api says so with a `progress` event per step (ADR 0025), which also
 * carries the step's sentence and the sources drawn on; a backend without it
 * (and the recorded demo) is read from the other events instead: the ask
 * opens the suitcase, the brief makes the list, options are looking in the
 * wardrobe, itinerary ops fold and fit, a warning weighs it, and the end of
 * the stream zips it up. Either way the step only moves forward.
 */
export const PACKING_STEPS = ["open", "list", "wardrobe", "fold", "weigh", "zip"] as const;
export type PackingStep = (typeof PACKING_STEPS)[number];

export interface PackingState {
  /** The furthest step reached; `zip` once the turn has ended well. */
  step: PackingStep;
  /** An itinerary patch arrived: something was folded into the trip. */
  folded: boolean;
  /** A `warn` op arrived: the suitcase was weighed and found heavy. */
  warned: boolean;
  /** The turn ended in an error: the luggage is lost. */
  failed: boolean;
  /** The server's sentence for the step, or `null` without `progress` events. */
  detail: string | null;
  /** What the turn has drawn on so far ("Wikivoyage", "Open-Meteo"). */
  sources: string[];
  /**
   * ai_api has sent a `progress` event this turn: from then on the steps are
   * its word alone, and the other events no longer move them.
   */
  live: boolean;
  /**
   * How many days the trip had when the turn left (TRA-244): a turn that
   * started with none and ends with some is the one that packed the trip, and
   * the only one whose suitcase is played in full.
   */
  daysBefore: number;
}

export interface PlannerState extends PlannerDraft {
  status: PlannerStatus;
  /** The last turn's packing, or `null` before any turn of this page. */
  packing: PackingState | null;
  error: PlannerErrorKind | null;
  /** Option groups shown and not yet answered. */
  pendingGroupIds: string[];
  /** Counts turns; the transcript re-pins to the bottom when it changes. */
  turn: number;
}

export const EMPTY_ITINERARY: ItineraryDraft = { stay: null, days: [], route: null, warnings: [] };

export function initialPlannerState(draft: PlannerDraft | null = null): PlannerState {
  return {
    messages: draft?.messages ?? [],
    groups: draft?.groups ?? {},
    brief: draft?.brief ?? EMPTY_BRIEF,
    missing: draft?.missing ?? [...BRIEF_FIELDS],
    itinerary: draft?.itinerary ?? EMPTY_ITINERARY,
    shortlist: draft?.shortlist ?? [],
    status: "idle",
    packing: null,
    error: null,
    pendingGroupIds: draft ? Object.values(draft.groups).filter((g) => g.selectedIds.length === 0).map((g) => g.group_id) : [],
    turn: 0,
  };
}

export function toPlannerDraft(state: PlannerState): PlannerDraft {
  const { messages, groups, brief, missing, itinerary, shortlist } = state;
  return { messages, groups, brief, missing, itinerary, shortlist };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type PlannerAction =
  /** A turn leaves for ai_api: the user's text (if any) and a pending assistant bubble. */
  | { type: "turn_started"; message: string | null }
  | { type: "event"; event: PlannerEvent }
  | { type: "turn_finished" }
  | { type: "turn_failed"; error: PlannerErrorKind }
  /** A quick reply answered part of the brief before the server confirms it. */
  | { type: "brief_patched"; patch: Partial<TripBrief> }
  /**
   * Cards picked in a carousel: chip + optimistic itinerary update. `slot` is
   * where the traveller said to put them when the group itself names none
   * (an unplaced `found:` group, TRA-185); `null` for every placed group.
   */
  | { type: "selected"; groupId: string; cardIds: string[]; slot: Slot | null }
  | { type: "dismissed"; groupId: string; cardId: string }
  | { type: "shortlist_toggled"; cardId: string }
  | { type: "removed"; slot: Slot; cardId: string }
  /** A guided ask starts the group's list over (TRA-184). */
  | { type: "group_cleared"; groupId: string }
  /**
   * A saved trip opened in the planner (TRA-196): the draft replaces
   * everything, transcript included, because it *is* the whole state now.
   */
  | { type: "hydrated"; draft: PlannerDraft }
  /**
   * "Retry" after a failed turn (TRA-239): the failed turn's own message
   * leaves the transcript, since the retried turn writes it again.
   */
  | { type: "retry_prepared" }
  | { type: "reset" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptySlots(): Record<DayPart, OptionCard[]> {
  return { morning: [], afternoon: [], evening: [], night: [] };
}

/** An unpinned option (`part: null`) goes to the morning; the panel has four parts. */
export function partOf(slot: Slot): DayPart {
  return slot.part ?? "morning";
}

function slotKey(slot: Slot | null): string {
  return slot ? `${slot.day}:${partOf(slot)}` : "";
}

function withDay(days: DayDraft[], day: number, update: (d: DayDraft) => DayDraft): DayDraft[] {
  const existing = days.find((d) => d.day === day);
  const next = update(existing ?? { day, title: null, weather: null, slots: emptySlots() });
  return [...days.filter((d) => d.day !== day), next].sort((a, b) => a.day - b.day);
}

function putCard(cards: OptionCard[], card: OptionCard): OptionCard[] {
  // Idempotent: the server's patch after an optimistic select does not duplicate.
  return cards.some((c) => c.id === card.id)
    ? cards.map((c) => (c.id === card.id ? card : c))
    : [...cards, card];
}

function clearSlotWarnings(warnings: ItineraryWarning[], slot: Slot): ItineraryWarning[] {
  const key = slotKey(slot);
  return warnings.filter((w) => slotKey(w.slot) !== key);
}

export function applyItineraryOp(itinerary: ItineraryDraft, op: ItineraryOp): ItineraryDraft {
  switch (op.op) {
    case "set_stay":
      return { ...itinerary, stay: op.card };
    case "put_activity": {
      const part = partOf(op.slot);
      return {
        ...itinerary,
        days: withDay(itinerary.days, op.slot.day, (d) => ({
          ...d,
          // A card lives in one part of a day: the server's patch after an
          // optimistic pick into another part moves it, never duplicates it.
          slots: Object.fromEntries(
            DAY_PARTS.map((k) => [
              k,
              k === part ? putCard(d.slots[k], op.card) : d.slots[k].filter((c) => c.id !== op.card.id),
            ])
          ) as Record<DayPart, OptionCard[]>,
        })),
        warnings: clearSlotWarnings(itinerary.warnings, op.slot),
      };
    }
    case "remove_activity": {
      const part = partOf(op.slot);
      return {
        ...itinerary,
        days: withDay(itinerary.days, op.slot.day, (d) => ({
          ...d,
          slots: { ...d.slots, [part]: d.slots[part].filter((c) => c.id !== op.card_id) },
        })),
        warnings: clearSlotWarnings(itinerary.warnings, op.slot),
      };
    }
    case "set_day_title":
      return {
        ...itinerary,
        days: withDay(itinerary.days, op.day, (d) => ({ ...d, title: op.title })),
      };
    case "set_route": {
      const { origin, destination, outbound_date, return_date, deep_link } = op;
      return { ...itinerary, route: { origin, destination, outbound_date, return_date, deep_link } };
    }
    case "set_weather": {
      const { summary, t_max, t_min, source } = op;
      return {
        ...itinerary,
        days: withDay(itinerary.days, op.day, (d) => ({
          ...d,
          weather: { summary, t_max, t_min, source },
        })),
      };
    }
    case "warn": {
      const key = `${slotKey(op.slot)}|${op.code}`;
      const others = itinerary.warnings.filter((w) => `${slotKey(w.slot)}|${w.code}` !== key);
      return {
        ...itinerary,
        warnings: [...others, { slot: op.slot, code: op.code, message: op.message }],
      };
    }
    default:
      return itinerary; // an op this build does not know: ignore
  }
}

/**
 * The latest options group offered for a slot, or `null`. Matched on the slot
 * the group carries, not on the id, so it finds the server's `slot:2:afternoon`
 * and the recorded session's own ids alike.
 */
export function groupForSlot(
  groups: Record<string, OptionGroupState>,
  slot: Slot
): OptionGroupState | null {
  const matching = Object.values(groups).filter(
    (group) =>
      group.slot !== null &&
      group.slot.day === slot.day &&
      partOf(group.slot) === partOf(slot)
  );
  return matching[matching.length - 1] ?? null;
}

/** The ids in one slot of the itinerary. */
function currentCardIds(itinerary: ItineraryDraft, slot: Slot): string[] {
  const day = itinerary.days.find((d) => d.day === slot.day);
  return day ? day.slots[partOf(slot)].map((c) => c.id) : [];
}

/** Applies a patch's ops in order. Pure. */
export function applyItineraryOps(itinerary: ItineraryDraft, ops: ItineraryOp[]): ItineraryDraft {
  return ops.reduce(applyItineraryOp, itinerary);
}

/** Days → parts → card ids, for the next turn's request. */
export function toItinerarySnapshot(itinerary: ItineraryDraft): ItinerarySnapshot {
  return {
    stay_card_id: itinerary.stay?.id ?? null,
    days: itinerary.days.map((d) => ({
      day: d.day,
      slots: Object.fromEntries(
        DAY_PARTS.map((part) => [part, d.slots[part].map((c) => c.id)])
      ) as Record<DayPart, string[]>,
    })),
  };
}

/** Which checklist fields the brief still lacks. Pure. */
export function computeMissing(brief: TripBrief): BriefField[] {
  const done: Record<BriefField, boolean> = {
    destination: !!brief.destination,
    origin: !!brief.origin,
    dates: !!brief.start_date && !!brief.end_date,
    travellers: brief.adults !== null && brief.adults > 0,
    interests: brief.interests.length > 0,
  };
  return BRIEF_FIELDS.filter((f) => !done[f]);
}

/** True once the itinerary has anything to show instead of the checklist. */
export function hasItinerary(itinerary: ItineraryDraft): boolean {
  return itinerary.stay !== null || itinerary.days.length > 0 || itinerary.route !== null;
}

/** The transcript as `ai_api` wants it replayed: text turns only, newest last. */
export function toHistory(messages: PlannerMessage[], limit = 20): ChatMessage[] {
  return messages
    .filter((m): m is Extract<PlannerMessage, { kind: "text" }> => m.kind === "text" && m.content.length > 0)
    .slice(-limit)
    .map(({ role, content }) => ({ role, content }));
}

function nextId(messages: PlannerMessage[]): string {
  return `m${messages.length + 1}`;
}

function appendText(
  messages: PlannerMessage[],
  role: "user" | "assistant",
  content: string
): PlannerMessage[] {
  return [...messages, { id: nextId(messages), kind: "text", role, content }];
}

/** Drops a trailing assistant bubble that never received text. */
function dropEmptyTail(messages: PlannerMessage[]): PlannerMessage[] {
  const last = messages[messages.length - 1];
  return last?.kind === "text" && last.role === "assistant" && last.content === ""
    ? messages.slice(0, -1)
    : messages;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

/** Moves the packing forward to `step`, never back. */
function packedTo(packing: PackingState | null, step: PackingStep): PackingState | null {
  if (!packing) return packing;
  const at = PACKING_STEPS.indexOf(packing.step);
  return PACKING_STEPS.indexOf(step) > at ? { ...packing, step } : packing;
}

/** What one event says about the packing. */
function packEvent(packing: PackingState | null, event: PlannerEvent): PackingState | null {
  switch (event.type) {
    case "progress": {
      const next = packedTo(packing, event.step);
      if (!next) return next;
      // The server's word for the step it is on: a step already passed keeps
      // the sentence of the one after it.
      const current = next.step === event.step;
      return {
        ...next,
        live: true,
        detail: current ? event.detail : next.detail,
        sources: event.sources.length > 0 ? event.sources : next.sources,
      };
    }
    case "brief":
      return packing?.live ? packing : packedTo(packing, "list");
    case "options":
      return packing?.live ? packing : packedTo(packing, "wardrobe");
    case "itinerary_patch": {
      const warned = event.ops.some((op) => op.op === "warn");
      const days = event.ops.some((op) => op.op === "put_activity" || op.op === "set_day_title");
      const step = warned ? "weigh" : days ? "fold" : null;
      const next = packing?.live || step === null ? packing : packedTo(packing, step);
      return next && { ...next, folded: true, warned: next.warned || warned };
    }
    case "error":
      return packing ? { ...packing, failed: true } : packing;
    default:
      return packing;
  }
}

function applyEvent(state: PlannerState, event: PlannerEvent): PlannerState {
  const packed = packEvent(state.packing, event);
  const next = applyEventToDraft(state, event);
  return packed === state.packing ? next : { ...next, packing: packed };
}

function applyEventToDraft(state: PlannerState, event: PlannerEvent): PlannerState {
  switch (event.type) {
    case "text": {
      const last = state.messages[state.messages.length - 1];
      const messages =
        last?.kind === "text" && last.role === "assistant"
          ? [...state.messages.slice(0, -1), { ...last, content: last.content + event.delta }]
          : appendText(state.messages, "assistant", event.delta);
      return { ...state, messages };
    }
    case "brief":
      return { ...state, brief: event.brief, missing: event.missing };
    case "options": {
      const { type: _type, ...group } = event;
      void _type;
      const messages = dropEmptyTail(state.messages);
      const pendingGroupIds = [
        ...state.pendingGroupIds.filter((id) => id !== group.group_id),
        group.group_id,
      ];
      const known = state.groups[group.group_id];
      if (known) {
        // "More options" (TRA-184): the next page joins the carousel already on
        // screen — new cards only, and no second bubble in the transcript.
        const fresh = group.cards.filter((card) => !known.cards.some((c) => c.id === card.id));
        return {
          ...state,
          groups: {
            ...state.groups,
            [group.group_id]: { ...known, ...group, cards: [...known.cards, ...fresh] },
          },
          messages,
          pendingGroupIds,
        };
      }
      return {
        ...state,
        groups: { ...state.groups, [group.group_id]: { ...group, selectedIds: [], dismissedIds: [] } },
        messages: [...messages, { id: nextId(messages), kind: "options", groupId: group.group_id }],
        pendingGroupIds,
      };
    }
    case "itinerary_patch":
      return { ...state, itinerary: applyItineraryOps(state.itinerary, event.ops) };
    case "error":
      return {
        ...state,
        status: "error",
        error: event.error_code.toLowerCase() === "unauthorized" ? "unauthorized" : "generic",
        messages: dropEmptyTail(state.messages),
      };
    case "done":
      return state; // `turn_finished` closes the turn once the stream ends
    default:
      return state;
  }
}

export function plannerReducer(state: PlannerState, action: PlannerAction): PlannerState {
  switch (action.type) {
    case "turn_started": {
      let messages = dropEmptyTail(state.messages);
      if (action.message) messages = appendText(messages, "user", action.message);
      messages = appendText(messages, "assistant", "");
      return {
        ...state,
        messages,
        status: "streaming",
        error: null,
        turn: state.turn + 1,
        packing: {
          step: "open",
          folded: false,
          warned: false,
          failed: false,
          detail: null,
          sources: [],
          live: false,
          daysBefore: state.itinerary.days.length,
        },
      };
    }
    case "event":
      return applyEvent(state, action.event);
    case "turn_finished":
      return {
        ...state,
        messages: dropEmptyTail(state.messages),
        status: state.status === "error" ? "error" : "idle",
        packing:
          state.status === "error" || !state.packing
            ? state.packing
            : { ...state.packing, step: "zip" },
      };
    case "turn_failed":
      return {
        ...state,
        messages: dropEmptyTail(state.messages),
        status: "error",
        error: action.error,
        packing: state.packing ? { ...state.packing, failed: true } : state.packing,
      };
    case "retry_prepared": {
      const messages = dropEmptyTail(state.messages);
      const last = messages[messages.length - 1];
      return {
        ...state,
        messages:
          last?.kind === "text" && last.role === "user" ? messages.slice(0, -1) : messages,
        status: "idle",
        error: null,
        packing: null,
      };
    }
    case "brief_patched": {
      const brief = { ...state.brief, ...action.patch };
      return { ...state, brief, missing: computeMissing(brief) };
    }
    case "selected": {
      const group = state.groups[action.groupId];
      if (!group) return state;
      const picked = group.cards.filter((c) => action.cardIds.includes(c.id));
      if (picked.length === 0) return state;

      // Optimistic: the panel updates at once; the server's patch reconciles it.
      let itinerary = state.itinerary;
      // Where the pick lands: the group's own slot, or the one the traveller
      // named for an unplaced group (TRA-185).
      const slot = group.slot ?? action.slot;
      if (group.kind === "hotel") {
        itinerary = applyItineraryOp(itinerary, { op: "set_stay", card: picked[0]! });
      } else if (slot) {
        // A single pick in a group that names its own slot replaces what that
        // slot held (the "Change" flow); a multi pick, and a slot the traveller
        // just chose, add to it. Both are what the server's patch will say.
        const cleared =
          group.slot && group.selection === "single"
            ? applyItineraryOps(
                itinerary,
                currentCardIds(itinerary, slot).map((card_id) => ({
                  op: "remove_activity" as const,
                  slot,
                  card_id,
                }))
              )
            : itinerary;
        itinerary = applyItineraryOps(
          cleared,
          picked.map((card) => ({ op: "put_activity", slot, card }))
        );
      }

      const messages = dropEmptyTail(state.messages);
      return {
        ...state,
        itinerary,
        groups: {
          ...state.groups,
          [group.group_id]: { ...group, selectedIds: picked.map((c) => c.id) },
        },
        messages: [
          ...messages,
          { id: nextId(messages), kind: "selection", titles: picked.map((c) => c.title) },
        ],
        pendingGroupIds: state.pendingGroupIds.filter((id) => id !== group.group_id),
      };
    }
    case "dismissed": {
      const group = state.groups[action.groupId];
      if (!group || group.dismissedIds.includes(action.cardId)) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [group.group_id]: { ...group, dismissedIds: [...group.dismissedIds, action.cardId] },
        },
      };
    }
    case "shortlist_toggled":
      return {
        ...state,
        shortlist: state.shortlist.includes(action.cardId)
          ? state.shortlist.filter((id) => id !== action.cardId)
          : [...state.shortlist, action.cardId],
      };
    case "removed":
      return {
        ...state,
        itinerary: applyItineraryOp(state.itinerary, {
          op: "remove_activity",
          slot: action.slot,
          card_id: action.cardId,
        }),
      };
    case "group_cleared": {
      const group = state.groups[action.groupId];
      if (!group) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.groupId]: { ...group, cards: [], selectedIds: [], dismissedIds: [] },
        },
      };
    }
    case "hydrated":
      // The turn counter carries on, so the transcript re-pins to the bottom
      // the way it does after any other change of what is on screen.
      return { ...initialPlannerState(action.draft), turn: state.turn + 1 };
    case "reset":
      return initialPlannerState();
    default:
      return state;
  }
}
