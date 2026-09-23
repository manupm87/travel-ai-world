/**
 * What the traveller saw on a turn (TRA-228), pure: the ask or the choice,
 * the answer, and the itinerary the ops drew — read back from the recorded
 * context, whose ops are compact (a card is its id and title).
 */

import { num, record, str, type TurnContext } from "./types";

export type Choice =
  | { kind: "select"; group: string }
  | { kind: "remove"; card: string }
  | null;

export interface DayRow {
  day: number;
  title: string | null;
  activities: string[];
}

export interface WeatherRow {
  day: number;
  summary: string;
  tMax: number | null;
  tMin: number | null;
}

export interface WarningRow {
  code: string;
  message: string;
  day: number | null;
}

export interface TravellerSummary {
  ask: string | null;
  choice: Choice;
  answer: string;
  stay: string | null;
  route: { origin: string; destination: string } | null;
  weather: WeatherRow[];
  days: DayRow[];
  warnings: WarningRow[];
  options: { group: string; count: number }[];
}

function cardTitle(value: unknown): string | null {
  const card = record(value);
  return card ? (str(card.title) ?? str(card.id)) : null;
}

function choiceOf(action: TurnContext["action"]): Choice {
  const a = record(action);
  if (!a) return null;
  if (a.type === "select") return { kind: "select", group: str(a.group_id) ?? "" };
  if (a.type === "remove") return { kind: "remove", card: str(a.card_id) ?? "" };
  return null;
}

export function travellerSummary(context: TurnContext): TravellerSummary {
  const summary: TravellerSummary = {
    ask: str(context.message),
    choice: choiceOf(context.action),
    answer: context.answer_text,
    stay: null,
    route: null,
    weather: [],
    days: [],
    warnings: [],
    options: [],
  };
  const days = new Map<number, DayRow>();
  const day = (n: number) => {
    let row = days.get(n);
    if (!row) {
      row = { day: n, title: null, activities: [] };
      days.set(n, row);
    }
    return row;
  };

  for (const raw of context.ops) {
    const op = record(raw);
    if (!op) continue;
    switch (op.op) {
      case "set_stay":
        summary.stay = cardTitle(op.card);
        break;
      case "set_route": {
        const origin = str(op.origin);
        const destination = str(op.destination);
        if (origin && destination) summary.route = { origin, destination };
        break;
      }
      case "set_day_title": {
        const n = num(op.day);
        if (n !== null) day(n).title = str(op.title);
        break;
      }
      case "put_activity": {
        const n = num(record(op.slot)?.day);
        const title = cardTitle(op.card);
        if (n !== null && title) day(n).activities.push(title);
        break;
      }
      case "set_weather": {
        const n = num(op.day);
        if (n !== null) {
          summary.weather.push({
            day: n,
            summary: str(op.summary) ?? "",
            tMax: num(op.t_max),
            tMin: num(op.t_min),
          });
        }
        break;
      }
      case "warn":
        summary.warnings.push({
          code: str(op.code) ?? "",
          message: str(op.message) ?? "",
          day: num(record(op.slot)?.day),
        });
        break;
    }
  }

  summary.days = [...days.values()].sort((a, b) => a.day - b.day);
  summary.weather.sort((a, b) => a.day - b.day);
  for (const raw of context.option_groups) {
    const group = record(raw);
    if (!group) continue;
    const ids = group.card_ids;
    summary.options.push({
      group: str(group.group_id) ?? "",
      count: Array.isArray(ids) ? ids.length : 0,
    });
  }
  return summary;
}

/** Whether the itinerary block (stay, route, weather) has anything to show. */
export function hasItinerary(s: TravellerSummary): boolean {
  return Boolean(s.stay || s.route || s.weather.length);
}

/** Whether the cards block (the days' places, the option groups) has anything to show. */
export function hasCards(s: TravellerSummary): boolean {
  return s.days.length > 0 || s.options.length > 0;
}
