import { commonsPhoto } from "@/data/planner-demo/session";
import type { PlannerCity } from "@/types/planner";

/**
 * The two cities the planner covers, as `GET /ai/planner/cities` publishes
 * them — country included since TRA-196, which is what a saved trip's city
 * columns are written from.
 */

export const BUDAPEST: PlannerCity = {
  slug: "budapest",
  name: "Budapest",
  country: "Hungary",
  country_code: "HU",
  centre: [47.4979, 19.0402],
  timezone: "Europe/Budapest",
  intro: {
    en: {
      text: "Budapest is the capital of Hungary.\n\nThe Danube splits it in two.",
      source_url: "https://en.wikivoyage.org/wiki/Budapest",
    },
    es: {
      text: "Budapest es la capital de Hungría.",
      source_url: "https://es.wikivoyage.org/wiki/Budapest",
    },
  },
  image_url: commonsPhoto("Budapest_hero.jpg"),
  image_credit: "Someone (CC BY-SA 4.0) · Wikimedia Commons",
};

export const BOLOGNA: PlannerCity = {
  slug: "bologna",
  name: "Bologna",
  country: "Italy",
  country_code: "IT",
  centre: [44.4939, 11.3428],
  timezone: "Europe/Rome",
  intro: {
    en: {
      text: "Bologna is a historic city in Emilia-Romagna.",
      source_url: "https://en.wikivoyage.org/wiki/Bologna",
    },
  },
  image_url: commonsPhoto("Bologna_hero.jpg"),
  image_credit: "Someone (CC BY-SA 3.0) · Wikimedia Commons",
};
