/**
 * One trip exactly as core_api answers it: three days in Budapest, saved from
 * the recorded planner session (`src/data/planner-demo/session.ts`).
 *
 * It is the only whole `TripResponse` in the repo, and it is real data — the
 * same corpus ids, photos and credits the planner streams — so the round trip
 * `tripToDraft(toTrip(BUDAPEST))` can be compared with the draft it was saved
 * from. Checked with `satisfies`, so a contract change breaks here first.
 */

import {
  ACTIVITIES,
  BATHS,
  BRIEF_COMPLETE,
  EXTRAS,
  HOTELS,
  MORE,
  RESTAURANTS,
} from "@/data/planner-demo/session";
import type { OptionCard } from "@/types/planner";
import type { TripResponse } from "@/types/trip";

type Day = TripResponse["itinerary_days"][number];
type ActivityDto = Day["activities"][number];
type MealDto = Day["meals"][number];
type PartOfDay = NonNullable<ActivityDto["part_of_day"]>;

export const TRIP_ID = "6f1f4a1e-3c8d-4f2b-9c21-0d1b5f7a2e10";
const DAY_IDS = [
  "1a2b3c4d-0001-4000-8000-000000000001",
  "1a2b3c4d-0002-4000-8000-000000000002",
  "1a2b3c4d-0003-4000-8000-000000000003",
] as const;

/** The hour each part of the day is written at (`services/trips.ts`). */
const TIME: Record<PartOfDay, string> = {
  morning: "10:00",
  afternoon: "15:00",
  evening: "19:00",
  night: "22:00",
};

let childId = 0;
const nextId = () => `c0ffee00-0000-4000-8000-${String(++childId).padStart(12, "0")}`;

/** A card saved as an activity, the way `saveDraftAsTrip` writes one. */
function activity(dayIndex: number, part: PartOfDay, card: OptionCard): ActivityDto {
  return {
    id: nextId(),
    itinerary_day_id: DAY_IDS[dayIndex]!,
    title: card.title,
    description: card.why,
    category: card.category,
    part_of_day: part,
    time: TIME[part],
    source_ref: card.id,
    card: { ...card },
    booking_required: false,
    location_name: card.title,
    location_city: "Budapest",
    location_lat: card.lat,
    location_lng: card.lon,
  };
}

/** And the same for a card the corpus calls `eat`. */
function meal(dayIndex: number, part: PartOfDay, card: OptionCard): MealDto {
  return {
    id: nextId(),
    itinerary_day_id: DAY_IDS[dayIndex]!,
    restaurant_name: card.title,
    type: part === "evening" || part === "night" ? "dinner" : "lunch",
    cuisine: card.subtitle,
    part_of_day: part,
    time: TIME[part],
    source_ref: card.id,
    card: { ...card },
    location_name: card.title,
    location_city: "Budapest",
    location_lat: card.lat,
    location_lng: card.lon,
  };
}

function day(index: number, title: string, children: (ActivityDto | MealDto)[]): Day {
  return {
    id: DAY_IDS[index]!,
    trip_id: TRIP_ID,
    day_number: index + 1,
    date: ["2026-10-23", "2026-10-24", "2026-10-25"][index]!,
    title,
    activities: children.filter((child): child is ActivityDto => "title" in child),
    meals: children.filter((child): child is MealDto => "restaurant_name" in child),
  };
}

/** Three days in Budapest, upcoming, with every card the session picked. */
const BUDAPEST = {
  id: TRIP_ID,
  user_id: "0b6f7c1e-5d3a-4c8e-9f21-7a4b2c9d1e60",
  title: "3 days in Budapest",
  description: null,
  phase: "upcoming",
  city_slug: "budapest",
  city: "Budapest",
  country: "Hungary",
  country_code: "HU",
  lat: 47.4979,
  lng: 19.0402,
  origin: BRIEF_COMPLETE.origin,
  budget_tier: BRIEF_COMPLETE.budget_tier,
  start_date: BRIEF_COMPLETE.start_date,
  end_date: BRIEF_COMPLETE.end_date,
  duration_days: 3,
  travelers_adults: 2,
  travelers_children: 0,
  travelers_infants: 0,
  travel_style: BRIEF_COMPLETE.interests,
  pace_preference: BRIEF_COMPLETE.pace,
  budget_currency: "EUR",
  image_url: HOTELS.rum.image_url,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-01T10:00:00Z",
  planner_session_id: null,
  itinerary_days: [
    day(0, "Arrival: Belváros and the Danube", [
      activity(0, "morning", ACTIVITIES.greatMarket),
      activity(0, "afternoon", EXTRAS.basilica),
      meal(0, "evening", RESTAURANTS.menza),
      activity(0, "night", ACTIVITIES.danubeWalk),
    ]),
    day(1, "Buda: the castle and thermal baths", [
      activity(1, "morning", ACTIVITIES.fishermansBastion),
      activity(1, "afternoon", BATHS.gellert),
      meal(1, "evening", RESTAURANTS.friciPapa),
      activity(1, "night", ACTIVITIES.szimpla),
    ]),
    day(2, "Monumental Pest and the Jewish Quarter", [
      activity(2, "morning", ACTIVITIES.parliament),
      activity(2, "afternoon", ACTIVITIES.synagogue),
      meal(2, "evening", EXTRAS.newYorkCafe),
      activity(2, "night", MORE.mazelTov),
    ]),
  ],
  accommodations: [
    {
      id: "acc00000-0000-4000-8000-000000000001",
      trip_id: TRIP_ID,
      name: HOTELS.rum.title,
      type: "hotel",
      city: "Budapest",
      country_code: "HU",
      source_ref: HOTELS.rum.id,
      card: { ...HOTELS.rum },
      check_in: BRIEF_COMPLETE.start_date,
      check_out: BRIEF_COMPLETE.end_date,
      lat: HOTELS.rum.lat,
      lng: HOTELS.rum.lon,
    },
  ],
  transportations: [
    {
      id: "leg00000-0000-4000-8000-000000000001",
      trip_id: TRIP_ID,
      category: "outbound",
      from_location: "Madrid",
      to_location: "Budapest",
      from_city: "Madrid",
      to_city: "Budapest",
      departure_time: "2026-10-23T00:00:00Z",
    },
    {
      id: "leg00000-0000-4000-8000-000000000002",
      trip_id: TRIP_ID,
      category: "return",
      from_location: "Budapest",
      to_location: "Madrid",
      from_city: "Budapest",
      to_city: "Madrid",
      departure_time: "2026-10-25T00:00:00Z",
    },
  ],
} satisfies TripResponse;

export default BUDAPEST;
