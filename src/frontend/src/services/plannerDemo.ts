/**
 * The planner's synthetic backend (TRA-158): plays the recorded Budapest
 * session (`data/planner-demo/session.ts`) as SSE v2 events, chosen from the
 * turn the page sends the way the real orchestrator would (message, action,
 * brief, itinerary snapshot), and streamed with the timing of a model.
 *
 * `services/planner.ts` falls back to it while `ai_api` has no `/planner`
 * route; the page shows a banner meanwhile. Nothing here talks to the network.
 */

import {
  ALL_CARDS,
  BATHS,
  GROUPS,
  GROUP_IDS,
  HOTELS,
  POOLS,
  TURNS,
} from "@/data/planner-demo/session";
import type {
  DayPart,
  ItineraryOp,
  ItinerarySnapshot,
  OptionCard,
  OptionsGroup,
  PlannerEvent,
  PlannerTurn,
  Slot,
} from "@/types/planner";
import { DAY_PARTS, EMPTY_BRIEF } from "@/types/planner";

export interface DemoOptions {
  /** No delays: every event at once (tests). */
  fast?: boolean;
  signal?: AbortSignal;
}

/** Milliseconds between streamed words, and before a structured event. */
const WORD_DELAY_MS = 28;
const STRUCTURED_DELAY_MS = 420;
const FIRST_TOKEN_DELAY_MS = 550;

const PART_WORDS: Record<DayPart, RegExp> = {
  morning: /morning|mañana/i,
  afternoon: /afternoon|tarde/i,
  evening: /evening|atardecer/i,
  night: /night|noche/i,
};

function text(delta: string): PlannerEvent {
  return { type: "text", delta };
}

function patch(ops: ItineraryOp[]): PlannerEvent {
  return { type: "itinerary_patch", ops };
}

function options(group: OptionsGroup): PlannerEvent {
  return { type: "options", ...group };
}

const DONE: PlannerEvent = { type: "done" };

function slotIds(itinerary: ItinerarySnapshot | null, slot: Slot): string[] {
  const day = itinerary?.days.find((d) => d.day === slot.day);
  return day ? day.slots[slot.part ?? "morning"] : [];
}

function allItineraryIds(itinerary: ItinerarySnapshot | null): Set<string> {
  const ids = new Set<string>();
  if (!itinerary) return ids;
  if (itinerary.stay_card_id) ids.add(itinerary.stay_card_id);
  for (const day of itinerary.days) {
    for (const part of DAY_PARTS) day.slots[part].forEach((id) => ids.add(id));
  }
  return ids;
}

function partLabel(part: DayPart): string {
  return part;
}

/** The slot named in "Alternatives for day 2 · afternoon" (en or es), or null. */
export function slotFromMessage(message: string): Slot | null {
  const day = /(?:day|d[ií]a)\s+(\d+)/i.exec(message);
  if (!day) return null;
  const part = DAY_PARTS.find((p) => PART_WORDS[p].test(message)) ?? null;
  return { day: Number(day[1]), part };
}

/** Three alternatives for any slot: that part of the day's pool, minus what the trip already has. */
function alternativesFor(slot: Slot, itinerary: ItinerarySnapshot | null): OptionsGroup {
  const taken = allItineraryIds(itinerary);
  const part = slot.part ?? "morning";
  const pool = POOLS[part].filter((c) => !taken.has(c.id));
  return {
    group_id: `g-alt-day${slot.day}-${part}`,
    kind: "experience",
    prompt: `Alternatives for day ${slot.day} · ${partLabel(part)}`,
    slot: { day: slot.day, part },
    selection: "single",
    cards: pool.slice(0, 3),
  };
}

function answerSelect(turn: PlannerTurn, groupId: string, cardIds: string[]): PlannerEvent[] {
  if (groupId === GROUP_IDS.neighbourhoods) return [...TURNS.neighbourhood];
  if (groupId === GROUP_IDS.hotels) return [...TURNS.hotel];
  if (groupId === GROUP_IDS.baths) return [...TURNS.bath];

  const picked = cardIds.map((id) => ALL_CARDS[id]).filter((c): c is OptionCard => !!c);
  if (picked.length === 0) return [...TURNS.fallback];
  const first = picked[0]!;

  // A hotel group (the stay's "Change"): the pick becomes the stay.
  if (groupId.startsWith("g-hotels")) {
    return [
      patch([{ op: "set_stay", card: first }]),
      text(`${first.title} is now your stay; the days stay as they were.`),
      DONE,
    ];
  }

  // Any slot group (`g-alt-day4-night`, the restaurants): replace what the slot held.
  const alt = /^g-alt-day(\d+)-(morning|afternoon|evening|night)$/.exec(groupId);
  const slot: Slot | null = alt
    ? { day: Number(alt[1]), part: alt[2] as DayPart }
    : groupId === GROUP_IDS.restaurants
      ? GROUPS.restaurants.slot
      : null;
  if (!slot) return [...TURNS.fallback];
  const ops: ItineraryOp[] = slotIds(turn.itinerary, slot)
    .filter((id) => !cardIds.includes(id))
    .map((card_id) => ({ op: "remove_activity" as const, slot, card_id }));
  picked.forEach((card) => ops.push({ op: "put_activity", slot, card }));
  return [
    patch(ops),
    text(`Added ${picked.map((c) => c.title).join(" and ")} to day ${slot.day}.`),
    DONE,
  ];
}

function answerMessage(turn: PlannerTurn): PlannerEvent[] {
  const message = turn.message ?? "";
  const lower = message.toLowerCase();
  const brief = turn.brief ?? EMPTY_BRIEF;
  const history = turn.history.filter((m) => m.role === "assistant").map((m) => m.content);
  const said = (fragment: string) => history.some((h) => h.includes(fragment));

  // 1. The brief is not known yet: read it from the opening message.
  if (!brief.destination || !brief.origin || !brief.adults) return [...TURNS.opening];

  // 2. Dates missing: the quick reply answers them; anything else is a nudge.
  if (!brief.start_date || !brief.end_date) {
    if (/\d{4}-\d{2}-\d{2}|^dates:|^fechas:/i.test(message)) return [...TURNS.dates];
    return [text("I only need the dates now: pick them above and I'll do the rest."), DONE];
  }

  // 3. Brief complete, no stay yet.
  if (!turn.itinerary?.stay_card_id) {
    if (/generate|genera/.test(lower)) return [...TURNS.hotel];
    if (said("These mid-range hotels")) {
      return [text("Pick one of the hotels above, or say \"generate the trip\" and I'll choose."), DONE];
    }
    if (said("these neighbourhoods fit")) return [...TURNS.neighbourhood];
    return [...TURNS.dates];
  }

  // 4. An itinerary exists: changes.
  const slot = /alternativ/i.test(lower) ? slotFromMessage(message) : null;
  if (slot) {
    if (slot.day === 2 && (slot.part ?? "morning") === "afternoon") return [...TURNS.alternatives];
    const group = alternativesFor(slot, turn.itinerary);
    return [
      text(`Here are alternatives for day ${slot.day} · ${partLabel(group.slot!.part ?? "morning")}:`),
      options(group),
      DONE,
    ];
  }
  if (/cheaper|barato/.test(lower)) {
    return [
      text("Moving you two streets into the Jewish Quarter saves the most: "),
      patch([{ op: "set_stay", card: HOTELS.cheaper }]),
      text("Maverick City Lodge is €, and everything on your list stays walkable."),
      DONE,
    ];
  }
  if (/thermal|termal|spa/.test(lower)) {
    return [
      text("Day 3 is the rainy one, so a thermal afternoon fits there: "),
      patch([
        { op: "set_day_title", day: 3, title: "Parliament, then an afternoon at Széchenyi" },
        ...slotIds(turn.itinerary, { day: 3, part: "afternoon" }).map((card_id) => ({
          op: "remove_activity" as const,
          slot: { day: 3, part: "afternoon" as const },
          card_id,
        })),
        { op: "put_activity", slot: { day: 3, part: "afternoon" }, card: BATHS.szechenyi },
      ]),
      text("Széchenyi's outdoor pools are warm even in the rain."),
      DONE,
    ];
  }
  if (/restaurant|restaurante|dinner|cena|eat|comer/.test(lower)) {
    return [
      text("Three Hungarian places within a short walk of Belváros, all €€ or less:"),
      options(GROUPS.restaurants),
      DONE,
    ];
  }
  if (/hotel/.test(lower)) {
    const current = turn.itinerary?.stay_card_id;
    return [
      text("Other stays near Belváros:"),
      options({
        ...GROUPS.hotels,
        group_id: `g-hotels-more-${history.length}`,
        prompt: "Other hotels",
        cards: Object.values(HOTELS).filter((h) => h.id !== current).slice(0, 3),
      }),
      DONE,
    ];
  }
  return [...TURNS.fallback];
}

/**
 * The events the synthetic backend answers a turn with. Pure and
 * deterministic: the same turn always gets the same events.
 */
export function demoEventsFor(turn: PlannerTurn): PlannerEvent[] {
  const action = turn.action;
  if (action?.type === "select") return answerSelect(turn, action.group_id, action.card_ids);
  if (action?.type === "remove") {
    const card = ALL_CARDS[action.card_id];
    return [text(`Removed ${card?.title ?? "that"} from day ${action.slot.day}.`), DONE];
  }
  return answerMessage(turn);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      resolve();
    });
  });
}

/** Word-sized deltas, so the transcript types like a model streams. */
export function toDeltas(content: string): string[] {
  return content.split(/(?<=\s)/).filter((d) => d.length > 0);
}

/**
 * Streams the demo answer to a turn: text word by word, a pause before each
 * structured event, `done` last. Aborting the signal ends the stream quietly.
 */
export async function* streamDemoTurn(
  turn: PlannerTurn,
  { fast = false, signal }: DemoOptions = {}
): AsyncGenerator<PlannerEvent, void, unknown> {
  const wait = fast ? async () => {} : (ms: number) => sleep(ms, signal);
  await wait(FIRST_TOKEN_DELAY_MS);
  for (const event of demoEventsFor(turn)) {
    if (signal?.aborted) return;
    if (event.type === "text") {
      for (const delta of toDeltas(event.delta)) {
        if (signal?.aborted) return;
        yield text(delta);
        await wait(WORD_DELAY_MS);
      }
      continue;
    }
    if (event.type !== "done") await wait(STRUCTURED_DELAY_MS);
    if (signal?.aborted) return;
    yield event;
  }
}
