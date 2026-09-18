/**
 * A recorded Budapest planning session (SSE v2 events, TRA-142), turn by
 * turn: the brief, the neighbourhood and hotel carousels, the first 5-day
 * itinerary and a "Change" on day 2's afternoon. Unit tests feed the events
 * to the reducer; the e2e spec serves them from a mocked `/ai/planner`.
 *
 * Checked with `satisfies` against the contract in `types/planner.ts`; keep
 * the copy in sync with what the tests assert.
 */

import type {
  ItineraryOp,
  OptionCard,
  PlannerEvent,
  PlannerTurn,
  TripBrief,
} from "@/types/planner";

const card = (overrides: Partial<OptionCard> & Pick<OptionCard, "id" | "title">): OptionCard => ({
  subtitle: null,
  district: null,
  category: "see",
  image_url: null,
  image_credit: null,
  price_tier: null,
  rating_text: null,
  hours: null,
  lat: null,
  lon: null,
  why: "",
  source: "Wikivoyage",
  source_url: "https://en.wikivoyage.org/wiki/Budapest",
  license: "CC BY-SA 4.0",
  deep_link: null,
  ...overrides,
});

export const BRIEF_AFTER_FIRST_MESSAGE: TripBrief = {
  destination: "Budapest",
  origin: "Madrid",
  start_date: null,
  end_date: null,
  nights: null,
  adults: 2,
  children: 0,
  budget_tier: 2,
  interests: ["food", "thermal_baths", "history"],
  pace: "balanced",
};

export const BRIEF_COMPLETE: TripBrief = {
  ...BRIEF_AFTER_FIRST_MESSAGE,
  start_date: "2026-10-23",
  end_date: "2026-10-27",
  nights: 4,
};

export const NEIGHBOURHOODS = {
  belvaros: card({
    id: "wv:belvaros",
    title: "Belváros",
    subtitle: "Downtown",
    district: "Pest",
    category: "district",
    price_tier: 2,
    why: "By the Danube and the Great Market Hall",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros",
  }),
  erzsebetvaros: card({
    id: "wv:erzsebetvaros",
    title: "Erzsébetváros",
    subtitle: "Jewish Quarter",
    district: "Pest",
    category: "district",
    price_tier: 1,
    why: "Great Synagogue and Szimpla Kert five minutes away",
  }),
  budavar: card({
    id: "wv:budavar",
    title: "Budavár",
    subtitle: "Castle District",
    district: "Buda",
    category: "district",
    price_tier: 3,
    why: "Quiet at night, views of the Parliament",
  }),
};

export const HOTELS = {
  rum: card({
    id: "wv:hotel-rum",
    title: "Hotel Rum Budapest",
    district: "Belváros",
    category: "sleep",
    price_tier: 2,
    lat: 47.4897,
    lon: 19.0576,
    why: "Five minutes on foot from the Great Market Hall",
    image_url: null,
  }),
  mercure: card({
    id: "wv:mercure-city-center",
    title: "Mercure Budapest City Center",
    district: "Belváros",
    category: "sleep",
    price_tier: 2,
    why: "On Váci utca, the pedestrian street downtown",
  }),
  basilica: card({
    id: "wv:hotel-central-basilica",
    title: "Hotel Central Basilica",
    district: "Lipótváros",
    category: "sleep",
    price_tier: 2,
    why: "Next to St. Stephen's Basilica",
  }),
};

export const BATHS = {
  gellert: card({
    id: "wv:gellert-baths",
    title: "Gellért Baths",
    district: "Gellérthegy",
    category: "do",
    price_tier: 2,
    hours: "09:00–19:00",
    why: "Hungarian Art Nouveau by Liberty Bridge",
  }),
  rudas: card({
    id: "wv:rudas-baths",
    title: "Rudas Baths",
    district: "Tabán",
    category: "do",
    price_tier: 2,
    hours: "06:00–20:00",
    why: "16th-century Ottoman dome, 15 minutes on foot from the castle",
  }),
  szechenyi: card({
    id: "wv:szechenyi-baths",
    title: "Széchenyi Baths",
    district: "Városliget",
    category: "do",
    price_tier: 2,
    hours: "07:00–20:00",
    why: "The largest; warm outdoor pools even in October",
  }),
  veliBej: card({
    id: "osm:veli-bej",
    title: "Veli Bej Baths",
    district: "Víziváros",
    category: "do",
    price_tier: 1,
    why: "Restored Turkish bath, less touristy",
    source: "OpenStreetMap",
    source_url: "https://www.openstreetmap.org/",
    license: "ODbL",
  }),
};

export const ACTIVITIES = {
  fishermansBastion: card({
    id: "wp:fishermans-bastion",
    title: "Fisherman's Bastion",
    district: "Budavár",
    category: "see",
    hours: "1–2 h",
    why: "The classic view over the Danube and the Parliament",
    source: "Wikipedia",
  }),
  castleLunch: card({
    id: "osm:castle-lunch",
    title: "Lunch in Budavár",
    subtitle: "Hungarian cuisine",
    district: "Budavár",
    category: "eat",
    price_tier: 2,
    why: "Goulash within the castle walls",
    source: "OpenStreetMap",
    license: "ODbL",
  }),
  danubeWalk: card({
    id: "wv:danube-promenade",
    title: "Evening walk along the Danube",
    district: "Belváros",
    category: "do",
    hours: "1 h",
    why: "The Parliament lit up from the Pest bank",
  }),
  parliament: card({
    id: "wp:hungarian-parliament",
    title: "Hungarian Parliament Building",
    district: "Lipótváros",
    category: "see",
    hours: "08:00–16:00",
    why: "Guided visit; book the English slot",
    source: "Wikipedia",
  }),
  greatMarket: card({
    id: "wv:great-market-hall",
    title: "Great Market Hall",
    district: "Belváros",
    category: "buy",
    hours: "06:00–18:00",
    why: "Lángos upstairs, paprika downstairs",
  }),
  synagogue: card({
    id: "wp:dohany-street-synagogue",
    title: "Dohány Street Synagogue",
    district: "Erzsébetváros",
    category: "see",
    why: "The largest synagogue in Europe",
    source: "Wikipedia",
  }),
  szimpla: card({
    id: "wv:szimpla-kert",
    title: "Szimpla Kert",
    district: "Erzsébetváros",
    category: "drink",
    price_tier: 1,
    why: "The original ruin bar",
  }),
};

export const FIRST_ITINERARY_OPS: ItineraryOp[] = [
  { op: "set_stay", card: HOTELS.rum },
  {
    op: "set_route",
    origin: "Madrid",
    destination: "Budapest",
    outbound_date: "2026-10-23",
    return_date: "2026-10-27",
    deep_link: "https://www.google.com/travel/flights?q=Flights%20from%20MAD%20to%20BUD",
  },
  { op: "set_day_title", day: 1, title: "Arrival and a first walk around Belváros" },
  { op: "set_day_title", day: 2, title: "Buda: the castle and thermal baths" },
  { op: "set_day_title", day: 3, title: "Monumental Pest: Parliament and the basilica" },
  { op: "set_day_title", day: 4, title: "Jewish Quarter, Great Synagogue and ruin bars" },
  { op: "set_day_title", day: 5, title: "Market morning and departure" },
  { op: "set_weather", day: 1, summary: "Cloudy", t_max: 14, t_min: 7, source: "Open-Meteo" },
  { op: "set_weather", day: 2, summary: "Sunny", t_max: 13, t_min: 6, source: "Open-Meteo" },
  { op: "set_weather", day: 3, summary: "Rain", t_max: 12, t_min: 6, source: "Open-Meteo" },
  { op: "set_weather", day: 4, summary: "Cloudy", t_max: 12, t_min: 5, source: "Open-Meteo" },
  { op: "set_weather", day: 5, summary: "Sunny", t_max: 11, t_min: 4, source: "Open-Meteo" },
  { op: "put_activity", slot: { day: 1, part: "evening" }, card: ACTIVITIES.danubeWalk },
  { op: "put_activity", slot: { day: 2, part: "morning" }, card: ACTIVITIES.fishermansBastion },
  { op: "put_activity", slot: { day: 2, part: "morning" }, card: ACTIVITIES.castleLunch },
  { op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.gellert },
  { op: "put_activity", slot: { day: 2, part: "night" }, card: ACTIVITIES.danubeWalk },
  { op: "put_activity", slot: { day: 3, part: "morning" }, card: ACTIVITIES.parliament },
  { op: "put_activity", slot: { day: 4, part: "morning" }, card: ACTIVITIES.synagogue },
  { op: "put_activity", slot: { day: 4, part: "night" }, card: ACTIVITIES.szimpla },
  { op: "put_activity", slot: { day: 5, part: "morning" }, card: ACTIVITIES.greatMarket },
  {
    op: "warn",
    slot: { day: 2, part: "afternoon" },
    code: "too_far",
    message: "40 minutes on foot from the previous stop",
  },
];

/** The user's messages, in the order the session sends them. */
export const USER_MESSAGES = {
  opening:
    "5 days in Budapest from Madrid with my partner, late October. We love food, thermal baths and history.",
  dates: "Dates: 2026-10-23 to 2026-10-27",
  generate: "Generate the trip",
  alternatives: "Alternatives for day 2 · afternoon",
} as const;

export const GROUP_IDS = {
  neighbourhoods: "g-neighbourhoods",
  hotels: "g-hotels",
  baths: "g-baths-day2-afternoon",
} as const;

/** Every turn's events, keyed by what the user did. */
export const TURNS = {
  opening: [
    { type: "text", delta: "Good plan! Late October is a great time for the thermal baths. " },
    { type: "brief", brief: BRIEF_AFTER_FIRST_MESSAGE, missing: ["dates"] },
    { type: "text", delta: "Which dates suit you best?" },
    { type: "done" },
  ],
  dates: [
    { type: "brief", brief: BRIEF_COMPLETE, missing: [] },
    {
      type: "text",
      delta: "Perfect. For food, thermal baths and history these neighbourhoods fit. Where would you like to stay?",
    },
    {
      type: "options",
      group_id: GROUP_IDS.neighbourhoods,
      kind: "neighbourhood",
      prompt: "Where would you like to stay?",
      slot: null,
      selection: "single",
      cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros, NEIGHBOURHOODS.budavar],
    },
    { type: "done" },
  ],
  neighbourhood: [
    { type: "text", delta: "These mid-range hotels are in Belváros or very close:" },
    {
      type: "options",
      group_id: GROUP_IDS.hotels,
      kind: "hotel",
      prompt: "Pick a hotel",
      slot: null,
      selection: "single",
      cards: [HOTELS.rum, HOTELS.mercure, HOTELS.basilica],
    },
    { type: "done" },
  ],
  hotel: [
    { type: "itinerary_patch", ops: FIRST_ITINERARY_OPS },
    {
      type: "text",
      delta: "Done. I've put together a first 5-day itinerary; press Change on any slot to see alternatives.",
    },
    { type: "done" },
  ],
  alternatives: [
    { type: "text", delta: "Here are alternatives for day 2 · afternoon. Rudas fits best after the castle." },
    {
      type: "options",
      group_id: GROUP_IDS.baths,
      kind: "experience",
      prompt: "Thermal baths for day 2 · afternoon",
      slot: { day: 2, part: "afternoon" },
      selection: "single",
      cards: [BATHS.rudas, BATHS.szechenyi, BATHS.veliBej],
    },
    { type: "done" },
  ],
  bath: [
    {
      type: "itinerary_patch",
      ops: [
        { op: "remove_activity", slot: { day: 2, part: "afternoon" }, card_id: BATHS.gellert.id },
        { op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.rudas },
      ],
    },
    { type: "text", delta: "Swapped: Rudas is now on day 2's afternoon." },
    { type: "done" },
  ],
  fallback: [{ type: "text", delta: "Noted. Anything else to adjust?" }, { type: "done" }],
} as const satisfies Record<string, readonly PlannerEvent[]>;

export type TurnName = keyof typeof TURNS;

/**
 * Which recorded turn answers a request: the e2e route mock and the stream
 * tests pick by the message or the structured action, like the backend would.
 */
export function turnFor(turn: PlannerTurn): TurnName {
  const action = turn.action;
  if (action?.type === "select") {
    if (action.group_id === GROUP_IDS.neighbourhoods) return "neighbourhood";
    if (action.group_id === GROUP_IDS.hotels) return "hotel";
    if (action.group_id === GROUP_IDS.baths) return "bath";
    return "fallback";
  }
  const message = turn.message ?? "";
  if (message === USER_MESSAGES.opening) return "opening";
  if (message.startsWith("Dates:") || message.startsWith("Fechas:")) return "dates";
  if (message.startsWith("Alternatives for") || message.startsWith("Alternativas para")) {
    return "alternatives";
  }
  return "fallback";
}

/** Encodes events as the wire sends them: one `data:` line each, then `[DONE]`. */
export function toSseBody(events: readonly PlannerEvent[]): string {
  return events
    .filter((e) => e.type !== "done")
    .map((e) => `data: ${JSON.stringify(e)}\n`)
    .join("")
    .concat("data: [DONE]\n");
}
