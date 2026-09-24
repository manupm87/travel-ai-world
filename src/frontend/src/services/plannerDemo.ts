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
  EXTRAS,
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
  SelectAction,
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

/**
 * The slot named in "Alternatives for day 2 · afternoon" (en or es), or null.
 * Guidance travels after a colon (TRA-184) and is read past: the slot is always
 * in the head, and "… · evening: morning pastries" names the evening.
 */
export function slotFromMessage(message: string): Slot | null {
  const head = message.split(":")[0] ?? message;
  const day = /(?:day|d[ií]a)\s+(\d+)/i.exec(head);
  if (!day) return null;
  const part = DAY_PARTS.find((p) => PART_WORDS[p].test(head)) ?? null;
  return { day: Number(day[1]), part };
}

/**
 * The group a paged ask continues: the recorded one that offered the ids it
 * rules out, so "More options" appends to the carousel on screen instead of
 * starting a second one. Otherwise the slot's own synthetic group.
 */
function groupIdFor(slot: Slot, part: DayPart, excluded: Set<string>): string {
  const offered = Object.values(GROUPS).find(
    (group) =>
      group.slot !== null &&
      group.slot.day === slot.day &&
      group.slot.part === part &&
      group.cards.some((card) => excluded.has(card.id))
  );
  return offered?.group_id ?? `g-alt-day${slot.day}-${part}`;
}

/**
 * Three alternatives for any slot: that part of the day's pool, minus what the
 * trip already has and what this ask already showed (`exclude_card_ids`), which
 * is how "More options" pages through the pool without repeating itself.
 */
function alternativesFor(
  slot: Slot,
  itinerary: ItinerarySnapshot | null,
  excluded: Set<string> = new Set()
): OptionsGroup {
  const taken = allItineraryIds(itinerary);
  const part = slot.part ?? "morning";
  const pool = POOLS[part].filter((c) => !taken.has(c.id) && !excluded.has(c.id));
  return {
    group_id: groupIdFor(slot, part, excluded),
    kind: "experience",
    prompt: `Alternatives for day ${slot.day} · ${partLabel(part)}`,
    slot: { day: slot.day, part },
    selection: "single",
    cards: pool.slice(0, 3),
  };
}

/**
 * The places the scripted answer about Margaret Island names, as cards: a
 * `found:` group, so it carries no slot and the traveller picks one (TRA-185).
 */
const MENTIONED_GROUP: OptionsGroup = {
  group_id: "found:demo1a2b",
  kind: "experience",
  prompt: "Add any of these to your trip:",
  slot: null,
  selection: "single",
  cards: [EXTRAS.margaretIsland, EXTRAS.basilica, EXTRAS.opera],
};

function answerSelect(turn: PlannerTurn, action: SelectAction): PlannerEvent[] {
  const { group_id: groupId, card_ids: cardIds } = action;
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

  // A group that names its own slot (`g-alt-day4-night`, the restaurants)
  // replaces what that slot held; a `found:` group names none, so the slot is
  // the one the traveller picked and the card is added to it (TRA-185).
  const alt = /^g-alt-day(\d+)-(morning|afternoon|evening|night)$/.exec(groupId);
  const named: Slot | null = alt
    ? { day: Number(alt[1]), part: alt[2] as DayPart }
    : groupId === GROUP_IDS.restaurants
      ? GROUPS.restaurants.slot
      : null;
  const slot = named ?? action.slot;
  if (!slot) return [...TURNS.fallback];
  const ops: ItineraryOp[] = named
    ? slotIds(turn.itinerary, slot)
        .filter((id) => !cardIds.includes(id))
        .map((card_id) => ({ op: "remove_activity" as const, slot, card_id }))
    : [];
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
    // What this ask already showed; the guidance itself is read past (TRA-184).
    const excluded = new Set(turn.exclude_card_ids);
    const first = excluded.size === 0;
    if (first && slot.day === 2 && (slot.part ?? "morning") === "afternoon") {
      return [...TURNS.alternatives];
    }
    const group = alternativesFor(slot, turn.itinerary, excluded);
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
  // A question about a place: the answer names three of them, and they come
  // back as an unplaced group so the picker works without a backend (TRA-185).
  if (/island|isla|margaret|margarita/.test(lower)) {
    return [
      text(
        "Margaret Island is the city's park in the middle of the Danube: the " +
          "Franciscan ruins and the Palatinus baths are both on it."
      ),
      options(MENTIONED_GROUP),
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
  if (action?.type === "select") return answerSelect(turn, action);
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
  for (const event of withProgress(demoEventsFor(turn))) {
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

// ─── Packing the suitcase (TRA-242) ─────────────────────────────────────────

type Step = Extract<PlannerEvent, { type: "progress" }>["step"];

const STEPS: readonly Step[] = ["open", "list", "wardrobe", "fold", "weigh", "zip"];

/** ai_api's English sentences (`prompts.py`, `progress_*`): the demo is in English. */
function sentence(step: Step, city: string | null, days: number | null): string {
  switch (step) {
    case "open":
      return city ? `Reading what you asked: ${city}.` : "Reading what you asked.";
    case "list":
      return "Noting the destination, the dates, who travels and what you're after.";
    case "wardrobe":
      return city ? `Looking through the guides for ${city}.` : "Looking through the guides.";
    case "fold":
      return days
        ? `Sharing the stops out over ${days} days, close to each other.`
        : "Choosing what fits and putting it in order.";
    case "weigh":
      return "Checking distances, opening hours and prices.";
    case "zip":
      return "Everything fits. Zipping it up.";
  }
}

function sourcesOf(event: PlannerEvent): string[] {
  if (event.type === "options") return event.cards.map((card) => card.source);
  if (event.type !== "itinerary_patch") return [];
  return event.ops.flatMap((op) =>
    op.op === "set_stay" || op.op === "put_activity"
      ? [op.card.source]
      : op.op === "set_weather"
        ? [op.source]
        : []
  );
}

type Patch = Extract<PlannerEvent, { type: "itinerary_patch" }>;

/** The day an op belongs to, or `null` for the stay, the route and a trip-wide warning. */
function dayOf(op: ItineraryOp): number | null {
  switch (op.op) {
    case "set_day_title":
      return op.day;
    case "put_activity":
    case "remove_activity":
      return op.slot.day;
    default:
      return null;
  }
}

/**
 * The recorded draft is one patch holding every day; ai_api streams one per
 * day, the forecast and the warnings after them. The demo splits it the same
 * way, so the suitcase fills day by day: the stay and the route first, then
 * each day, then the weighing.
 */
function splitPatch(event: Patch): Patch[] {
  const head = event.ops.filter((op) => dayOf(op) === null && op.op !== "set_weather" && op.op !== "warn");
  const tail = event.ops.filter((op) => op.op === "set_weather" || op.op === "warn");
  const days = [...new Set(event.ops.map(dayOf).filter((day): day is number => day !== null))];
  const parts = [
    head,
    ...days.map((day) => event.ops.filter((op) => dayOf(op) === day)),
    tail,
  ].filter((ops) => ops.length > 0);
  return parts.length > 1 ? parts.map((ops) => ({ type: "itinerary_patch", ops })) : [event];
}

/**
 * The recorded session has no `progress` events (it predates them), so the demo
 * adds them the way `PackingProgress` in ai_api does (ADR 0025): `open` first,
 * `list` before the brief, `wardrobe` before options, `fold` with the first
 * day, `weigh` with the warnings and the forecast, `zip` before the closing
 * words — forward only, and the same step again whenever a new source turns
 * up. A patch holding several days is split into one per day first. Pure.
 */
export function withProgress(recorded: readonly PlannerEvent[]): PlannerEvent[] {
  const events: PlannerEvent[] = recorded.flatMap((event): PlannerEvent[] =>
    event.type === "itinerary_patch" ? splitPatch(event as Patch) : [event]
  );
  const lastStructured = events.reduce(
    (last, event, index) => (event.type !== "text" && event.type !== "done" ? index : last),
    -1
  );
  const days = new Set<number>();
  for (const event of events) {
    if (event.type !== "itinerary_patch") continue;
    for (const op of event.ops) if (op.op === "set_day_title") days.add(op.day);
  }

  const out: PlannerEvent[] = [];
  const sources: string[] = [];
  let city: string | null = null;
  let step: Step | null = null;
  let detail = "";

  const reach = (next: Step) => {
    if (step !== null && STEPS.indexOf(next) <= STEPS.indexOf(step)) return;
    step = next;
    detail = sentence(next, city, next === "fold" && days.size > 0 ? days.size : null);
    out.push({ type: "progress", step, detail, sources: [...sources] });
  };

  reach("open");
  events.forEach((event, index) => {
    if (event.type === "brief") {
      city = event.brief.destination;
      reach("list");
    } else if (event.type === "options") {
      reach("wardrobe");
    } else if (event.type === "itinerary_patch") {
      if (event.ops.some((op) => op.op === "set_day_title" || op.op === "put_activity")) {
        reach("wardrobe");
        reach("fold");
      }
      if (event.ops.some((op) => op.op === "warn" || op.op === "set_weather")) reach("weigh");
    } else if (event.type === "text" && index > lastStructured) {
      reach("zip");
    }
    out.push(event);
    const fresh = [...new Set(sourcesOf(event))].filter((s) => s && !sources.includes(s));
    if (fresh.length > 0 && step !== null) {
      sources.push(...fresh);
      out.push({ type: "progress", step, detail, sources: [...sources] });
    }
  });
  return out;
}
