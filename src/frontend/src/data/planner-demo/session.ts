/**
 * A recorded Budapest planning session (SSE v2 events, TRA-142), turn by
 * turn: the brief, the neighbourhood and hotel carousels, the first 3-day
 * itinerary (every part of every day filled) and a "Change" on day 2's afternoon.
 *
 * It ships with the app: `services/plannerDemo.ts` plays it as a synthetic
 * backend while `ai_api` has no `/planner` route (TRA-158), and the unit
 * tests and `e2e/planner.spec.ts` drive the page with it. Every card carries
 * a real corpus document id (`tools/city_corpus`, Wikivoyage / Wikipedia /
 * OpenStreetMap) and a licence-clean Wikimedia Commons photo with its credit.
 * Prices are tiers only. Checked with `satisfies` against `types/planner.ts`.
 */

import type {
  DayPart,
  ItineraryOp,
  OptionCard,
  OptionsGroup,
  PlannerEvent,
  PlannerTurn,
  TripBrief,
} from "@/types/planner";

// ─── Photos ───────────────────────────────────────────────────────────────────

/** A Commons file rendered at a fixed width; the redirect target never changes. */
export function commonsPhoto(file: string, width = 800): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

/** `image_url` + `image_credit` for a Commons file (author and licence as Commons lists them). */
function photo(file: string, author: string, licence: string) {
  return {
    image_url: commonsPhoto(file),
    image_credit: `${author} (${licence}) · Wikimedia Commons`,
  };
}

const WIKIVOYAGE = {
  source: "Wikivoyage",
  license: "CC BY-SA 4.0",
};
const WIKIPEDIA = { source: "Wikipedia", license: "CC BY-SA 4.0" };
const OSM = { source: "OpenStreetMap", license: "ODbL", source_url: "https://www.openstreetmap.org/" };

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
  source_url: "https://en.wikivoyage.org/wiki/Budapest",
  deep_link: null,
  ...WIKIVOYAGE,
  ...overrides,
});

// ─── The brief ────────────────────────────────────────────────────────────────

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
  end_date: "2026-10-25",
  nights: 2,
};

// ─── Cards ────────────────────────────────────────────────────────────────────

export const NEIGHBOURHOODS = {
  belvaros: card({
    id: "wv:en:Budapest/Belváros",
    title: "Belváros",
    subtitle: "Downtown",
    district: "Pest",
    category: "district",
    price_tier: 2,
    lat: 47.4925,
    lon: 19.0513,
    why: "By the Danube and the Great Market Hall",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros",
    ...photo("Vörösmarty tér -.jpg", "Elekes Andor", "CC BY-SA 4.0"),
  }),
  erzsebetvaros: card({
    id: "wv:en:Budapest/Erzsébetváros",
    title: "Erzsébetváros",
    subtitle: "Jewish Quarter",
    district: "Pest",
    category: "district",
    price_tier: 1,
    lat: 47.4998,
    lon: 19.0665,
    why: "Great Synagogue and Szimpla Kert five minutes away",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Erzs%C3%A9betv%C3%A1ros",
    ...photo("Kazinczy utca, Budapest.jpg", "tomasz przechlewski", "CC BY 2.0"),
  }),
  budavar: card({
    id: "wv:en:Budapest/Budavár",
    title: "Budavár",
    subtitle: "Castle District",
    district: "Buda",
    category: "district",
    price_tier: 3,
    lat: 47.4961,
    lon: 19.0396,
    why: "Quiet at night, views of the Parliament",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r",
    ...photo("Budavári Palota, ABCDEF épület.jpg", "Varius", "CC BY-SA 3.0"),
  }),
};

export const HOTELS = {
  rum: card({
    id: "osm:node/5873075722",
    title: "Hotel Rum Budapest",
    district: "Belváros",
    category: "sleep",
    price_tier: 2,
    lat: 47.4897,
    lon: 19.0576,
    why: "Five minutes on foot from the Great Market Hall",
    ...OSM,
    source_url: "https://www.openstreetmap.org/node/5873075722",
    ...photo("Kálvin tér 8. (a).jpg", "Sir Morosus", "CC BY-SA 4.0"),
  }),
  mercure: card({
    id: "wv:en:Budapest/Belváros#sleep:mercure-budapest-city-centre",
    title: "Mercure Budapest City Center",
    district: "Belváros",
    category: "sleep",
    price_tier: 2,
    lat: 47.4938,
    lon: 19.0523,
    why: "On Váci utca, the pedestrian street downtown",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#Sleep",
    ...photo(
      "Mercure Hotel, entrance, Kecskemeti Street, 2016 Budapest.jpg",
      "Globetrotter19",
      "CC BY-SA 3.0"
    ),
  }),
  basilica: card({
    id: "osm:relation/13067",
    title: "Hotel Central Basilica",
    district: "Lipótváros",
    category: "sleep",
    price_tier: 2,
    lat: 47.5008,
    lon: 19.0537,
    why: "Next to St. Stephen's Basilica",
    ...OSM,
    source_url: "https://www.openstreetmap.org/relation/13067",
    ...photo("Budapest Szent Istvan Bazilika R01.jpg", "Marc Ryckaert (MJJR)", "CC BY 3.0"),
  }),
  /** The "make it cheaper" answer: a budget stay in the Jewish Quarter. */
  cheaper: card({
    id: "wv:en:Budapest/Erzsébetváros#sleep:maverick-city-lodge",
    title: "Maverick City Lodge",
    district: "Erzsébetváros",
    category: "sleep",
    price_tier: 1,
    lat: 47.4972,
    lon: 19.0621,
    why: "Private rooms at hostel prices, two streets from Gozsdu udvar",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Erzs%C3%A9betv%C3%A1ros#Sleep",
    ...photo("Budapest, Gozsdu Udvar, 3.jpg", "Christo", "CC BY-SA 4.0"),
  }),
};

export const BATHS = {
  gellert: card({
    id: "wv:en:Budapest/South Buda#do:gellert-baths",
    title: "Gellért Baths",
    district: "Gellérthegy",
    category: "do",
    price_tier: 2,
    hours: "09:00–19:00",
    lat: 47.4838,
    lon: 19.0524,
    why: "Hungarian Art Nouveau by Liberty Bridge",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/South_Buda#Do",
    ...photo("Budapest, Gellért fürdő.jpg", "József Rozsnyai", "CC BY-SA 3.0"),
  }),
  rudas: card({
    id: "wv:en:Budapest/Víziváros#do:rudas-thermal-bath",
    title: "Rudas Baths",
    district: "Tabán",
    category: "do",
    price_tier: 2,
    hours: "06:00–20:00",
    lat: 47.4889,
    lon: 19.0473,
    why: "16th-century Ottoman dome, 15 minutes on foot from the castle",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/V%C3%ADziv%C3%A1ros#Do",
    ...photo("Rudas gyogyfurdo P7290076-1000.jpg", "misibacsi", "Public domain"),
  }),
  szechenyi: card({
    id: "wv:en:Budapest/Városliget#do:szechenyi-thermal-bath",
    title: "Széchenyi Baths",
    district: "Városliget",
    category: "do",
    price_tier: 2,
    hours: "07:00–20:00",
    lat: 47.5186,
    lon: 19.0819,
    why: "The largest; warm outdoor pools even in October",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/V%C3%A1rosliget#Do",
    ...photo("Budapest Széchenyi Baths R02.jpg", "Marc Ryckaert (MJJR)", "CC BY 3.0"),
  }),
  veliBej: card({
    id: "osm:way/37126186",
    title: "Veli Bej Baths",
    district: "Víziváros",
    category: "do",
    price_tier: 1,
    hours: "06:00–12:00, 15:00–21:00",
    lat: 47.5163,
    lon: 19.0364,
    why: "Restored Turkish bath, less touristy",
    ...OSM,
    source_url: "https://www.openstreetmap.org/way/37126186",
    ...photo("Budapest, Veli Bej fürdő.jpg", "Christo", "CC BY-SA 4.0"),
  }),
};

export const ACTIVITIES = {
  fishermansBastion: card({
    id: "wv:en:Budapest/Budavár#see:fisherman-s-bastion",
    title: "Fisherman's Bastion",
    district: "Budavár",
    category: "see",
    hours: "1–2 h",
    lat: 47.5022,
    lon: 19.0348,
    why: "The classic view over the Danube and the Parliament",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r#See",
    ...photo("Halászbástya 2017.jpg", "Brian Adamson", "CC BY 2.0"),
  }),
  castleLunch: card({
    id: "wv:en:Budapest/Budavár#eat:halaszbastya-restaurant",
    title: "Dinner in Budavár",
    subtitle: "Hungarian cuisine at Halászbástya",
    district: "Budavár",
    category: "eat",
    price_tier: 2,
    lat: 47.5023,
    lon: 19.0351,
    why: "Goulash within the castle walls, tables by the bastion",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r#Eat",
    ...photo("Goulash hungarian.jpg", "RitaE", "CC0"),
  }),
  danubeWalk: card({
    id: "wv:en:Budapest/Belváros#see:szechenyi-chain-bridge",
    title: "Evening walk along the Danube",
    district: "Belváros",
    category: "do",
    hours: "1 h",
    lat: 47.4989,
    lon: 19.0437,
    why: "The Parliament lit up from the Pest bank",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#See",
    ...photo("Széchenyi Chain Bridge in Budapest at night.jpg", "Wilfredor", "CC0"),
  }),
  parliament: card({
    id: "wp:en:3032195#s0-c1",
    title: "Hungarian Parliament Building",
    district: "Lipótváros",
    category: "see",
    hours: "08:00–16:00",
    lat: 47.5071,
    lon: 19.0457,
    why: "Guided visit; book the English slot",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/Hungarian_Parliament_Building",
    ...photo(
      "Hungarian Parliament Building from across the Danube, 2025-01-11.jpg",
      "Kilyann Le Hen",
      "CC BY 4.0"
    ),
  }),
  greatMarket: card({
    id: "wv:en:Budapest/Ferencváros#do:great-market-hall",
    title: "Great Market Hall",
    district: "Ferencváros",
    category: "buy",
    hours: "06:00–18:00",
    lat: 47.4871,
    lon: 19.0587,
    why: "Lángos upstairs, paprika downstairs",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Ferencv%C3%A1ros#Do",
    ...photo("VasarcsarnokFotoThalerTamas.JPG", "Thaler Tamas", "CC BY-SA 4.0"),
  }),
  synagogue: card({
    id: "wp:en:7706391#s0-c1",
    title: "Dohány Street Synagogue",
    district: "Erzsébetváros",
    category: "see",
    lat: 47.4959,
    lon: 19.0605,
    why: "The largest synagogue in Europe",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/Doh%C3%A1ny_Street_Synagogue",
    ...photo(
      "Interior of the Great Synagogue in Dohány Street 20180824.jpg",
      "Suicasmo",
      "CC BY-SA 4.0"
    ),
  }),
  szimpla: card({
    id: "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi",
    title: "Szimpla Kert",
    district: "Erzsébetváros",
    category: "drink",
    price_tier: 1,
    lat: 47.4968,
    lon: 19.0634,
    why: "The original ruin bar",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Erzs%C3%A9betv%C3%A1ros#Drink",
    ...photo("Szimpla Kert Trabant.jpg", "JoshuaCrawford", "CC BY-SA 4.0"),
  }),
};

/** "Hungarian restaurants nearby": three real places, all under €€. */
export const RESTAURANTS = {
  menza: card({
    id: "osm:node/419017260",
    title: "Menza",
    subtitle: "Retro Hungarian",
    district: "Terézváros",
    category: "eat",
    price_tier: 2,
    hours: "11:00–23:30",
    lat: 47.5044,
    lon: 19.0637,
    why: "Seventies canteen look, paprikash done properly, on Liszt Ferenc tér",
    ...OSM,
    source_url: "https://www.openstreetmap.org/node/419017260",
    ...photo("Menza Restaurant, Budapest 03.jpg", "Matthias Mueller", "CC BY 2.0"),
  }),
  friciPapa: card({
    id: "osm:node/419952787",
    title: "Frici Papa Kifőzdéje",
    subtitle: "Home cooking",
    district: "Erzsébetváros",
    category: "eat",
    price_tier: 1,
    hours: "11:00–23:00",
    lat: 47.5013,
    lon: 19.0626,
    why: "A daily menu on Király utca, the cheapest sit-down goulash around",
    ...OSM,
    source_url: "https://www.openstreetmap.org/node/419952787",
    ...photo(
      "Frici Papa Kifőzdéje at 55 Király Street Budapest, Erzsébetváros, Hungary - panoramio.jpg",
      "dinamicline",
      "CC BY-SA 3.0"
    ),
  }),
  langos: card({
    id: "osm:node/11285789569",
    title: "Gozsdu Lángos Bistro",
    subtitle: "Street food",
    district: "Erzsébetváros",
    category: "eat",
    price_tier: 1,
    hours: "11:00–22:00",
    lat: 47.4985,
    lon: 19.0613,
    why: "Lángos with sour cream and cheese, eaten standing in Gozsdu udvar",
    ...OSM,
    source_url: "https://www.openstreetmap.org/node/11285789569",
    ...photo("Budapest, Retro Lángos Büfé.jpg", "Christo", "CC BY-SA 4.0"),
  }),
};

/** Alternatives the demo offers for any other slot. */
export const EXTRAS = {
  basilica: card({
    id: "wv:en:Budapest/Belváros#see:st-stephen-istvan-basilica",
    title: "St. Stephen's Basilica",
    district: "Lipótváros",
    category: "see",
    hours: "09:00–19:00",
    lat: 47.5008,
    lon: 19.0539,
    why: "Climb the dome for the best view of Pest",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#See",
    ...photo("Budapest Szent Istvan Bazilika R01.jpg", "Marc Ryckaert (MJJR)", "CC BY 3.0"),
  }),
  libertyBridge: card({
    id: "wv:en:Budapest/Belváros#see:liberty-bridge",
    title: "Liberty Bridge and Gellért Hill",
    district: "Belváros",
    category: "do",
    hours: "2 h",
    lat: 47.4857,
    lon: 19.0554,
    why: "Cross the green bridge, climb to the Citadella for sunset",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#See",
    ...photo("Szabadság híd Budapest September 2013.JPG", "Felix König", "CC BY 3.0"),
  }),
  margaretIsland: card({
    id: "wv:en:Budapest/Angyalföld#see:margaret-island",
    title: "Margaret Island",
    district: "Angyalföld",
    category: "see",
    hours: "24/7",
    lat: 47.5271,
    lon: 19.0486,
    why: "A car-free park in the middle of the Danube, musical fountain on the hour",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Angyalf%C3%B6ld#See",
    ...photo(
      "Funnel. Musical fountain on Margaret Island. - Budapest, Hungary.JPG",
      "Globetrotter19",
      "CC BY-SA 3.0"
    ),
  }),
  opera: card({
    id: "wv:en:Budapest/Terézváros#do:state-opera-or-hungarian-state-opera-house",
    title: "Hungarian State Opera House",
    district: "Terézváros",
    category: "do",
    hours: "Tours at 15:00 and 16:00",
    lat: 47.5026,
    lon: 19.0581,
    why: "The guided tour ends with a short live aria",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Ter%C3%A9zv%C3%A1ros#Do",
    ...photo("Hungarian State Opera House Budapest 2026.JPG", "Mike is Michi", "CC BY-SA 4.0"),
  }),
  gerbeaud: card({
    id: "wp:en:20973362#s0-c1",
    title: "Café Gerbeaud",
    subtitle: "Coffee house since 1858",
    district: "Belváros",
    category: "eat",
    price_tier: 3,
    hours: "09:00–20:00",
    lat: 47.4963,
    lon: 19.0503,
    why: "Dobos torte under chandeliers on Vörösmarty tér",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/Caf%C3%A9_Gerbeaud",
    ...photo("Gerbeaud Budapest 2005 078.jpg", "Norbert Aepli", "CC BY 2.5"),
  }),
  newYorkCafe: card({
    id: "wv:en:Budapest/Erzsébetváros#eat:new-york-cafe",
    title: "New York Café",
    subtitle: "Belle Époque coffee house",
    district: "Erzsébetváros",
    category: "eat",
    price_tier: 3,
    hours: "09:00–00:00",
    lat: 47.4981,
    lon: 19.0703,
    why: "Gilded ceilings; go for coffee, not for lunch",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Erzs%C3%A9betv%C3%A1ros#Eat",
    ...photo("Clocks in New York Café Budapest (2).jpg", "Gzzz", "CC BY-SA 4.0"),
  }),
  gozsdu: card({
    id: "wv:en:Budapest/Erzsébetváros#see:gozsdu-yard-complex",
    title: "Gozsdu udvar",
    district: "Erzsébetváros",
    category: "drink",
    price_tier: 2,
    hours: "1–2 h",
    lat: 47.4983,
    lon: 19.0612,
    why: "Seven linked courtyards of bars; Sunday antiques market",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Erzs%C3%A9betv%C3%A1ros#See",
    ...photo("Budapest, Gozsdu Udvar, 3.jpg", "Christo", "CC BY-SA 4.0"),
  }),
};

/** More photographed places, so every "Change" has fresh options (TRA-159). */
export const MORE = {
  matthiasChurch: card({
    id: "wv:en:Budapest/Budavár#see:matthias-church",
    title: "Matthias Church",
    district: "Budavár",
    category: "see",
    hours: "09:00–17:00",
    lat: 47.502,
    lon: 19.0341,
    why: "Diamond-tiled roof and the coronation church of the Habsburg kings",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r#See",
    ...photo("Matthias Church 2014 01.jpg", "Perituss", "CC0"),
  }),
  heroesSquare: card({
    id: "wp:en:2613261#s0-c1",
    title: "Heroes' Square",
    district: "Városliget",
    category: "see",
    hours: "24/7",
    lat: 47.515,
    lon: 19.0778,
    why: "The Millennium Monument at the top of Andrássy út",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/Heroes%27_Square_(Budapest)",
    ...photo("HUN-2015-Budapest-Heroes’ Square.jpg", "Godot13", "Attribution"),
  }),
  vajdahunyad: card({
    id: "wv:en:Budapest/Városliget#see:vajdahunyad-castle",
    title: "Vajdahunyad Castle",
    district: "Városliget",
    category: "see",
    hours: "1 h",
    lat: 47.5148,
    lon: 19.0822,
    why: "A castle built for an exhibition, copying styles from all over Hungary",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/V%C3%A1rosliget#See",
    ...photo("Vajdahunyad vára Budapest September 2013.jpg", "Felix König", "CC BY 3.0"),
  }),
  houseOfTerror: card({
    id: "wp:en:2641959#s0-c1",
    title: "House of Terror",
    district: "Terézváros",
    category: "see",
    hours: "10:00–18:00, closed Mon",
    lat: 47.5071,
    lon: 19.0648,
    why: "The 20th century in one building on Andrássy út; allow two hours",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/House_of_Terror",
    ...photo("Budapest - Terror Háza Múzeum (37766898364).jpg", "Fred Romero", "CC BY 2.0"),
  }),
  shoes: card({
    id: "wv:en:Budapest/Belváros#see:shoes-on-the-danube-memorial",
    title: "Shoes on the Danube Bank",
    district: "Belváros",
    category: "see",
    hours: "24/7",
    lat: 47.5039,
    lon: 19.0451,
    why: "A quiet memorial on the embankment, ten minutes from the Parliament",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros#See",
    ...photo(
      "Girl contemplates Shoes on the Danube Bank (Budapest, Hungary).jpg",
      "Jules Verne Times Two",
      "CC BY-SA 4.0"
    ),
  }),
  citadella: card({
    id: "wv:en:Budapest/South Buda#see:citadella",
    title: "Citadella and the Liberty Statue",
    district: "Gellérthegy",
    category: "do",
    hours: "1–2 h",
    lat: 47.4868,
    lon: 19.0468,
    why: "The best panorama of the city, twenty minutes uphill from Gellért",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/South_Buda#See",
    ...photo(
      "Liberty Statue at The Citadella on Gellert Hill (42972655021).jpg",
      "Nan Palmero",
      "CC BY 2.0"
    ),
  }),
  lukacs: card({
    id: "wv:en:Budapest/North Buda#do:thermal-bath-szent-lukacs",
    title: "Lukács Baths",
    district: "North Buda",
    category: "do",
    price_tier: 1,
    hours: "07:00–19:00",
    lat: 47.5183,
    lon: 19.0369,
    why: "Where locals go; cheaper and calmer than the famous ones",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/North_Buda#Do",
    ...photo("Budapest, Lukács fürdő, 4.jpg", "Christo", "CC BY-SA 4.0"),
  }),
  varosliget: card({
    id: "wv:en:Budapest/Városliget",
    title: "Városliget park",
    district: "Városliget",
    category: "do",
    hours: "2 h",
    lat: 47.5147,
    lon: 19.0813,
    why: "Boating lake, the zoo and Széchenyi in one green square kilometre",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/V%C3%A1rosliget",
    ...photo("Budapest, Városliget, 28.jpg", "Christo", "CC BY-SA 4.0"),
  }),
  ruszwurm: card({
    id: "wv:en:Budapest/Budavár#drink:ruszwurm-confectionery",
    title: "Ruszwurm Confectionery",
    subtitle: "Cakes since 1827",
    district: "Budavár",
    category: "eat",
    price_tier: 2,
    hours: "10:00–19:00",
    lat: 47.5017,
    lon: 19.0338,
    why: "Krémes in a tiny Biedermeier room by Matthias Church",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/Budav%C3%A1r#Drink",
    ...photo("Ruszwurm Cukrászda, Budapest.jpg", "dpotera", "CC BY 2.0"),
  }),
  mazelTov: card({
    id: "osm:node/3990944430",
    title: "Mazel Tov",
    subtitle: "Ruin bar and kitchen",
    district: "Erzsébetváros",
    category: "drink",
    price_tier: 2,
    hours: "12:00–00:00",
    lat: 47.4988,
    lon: 19.0628,
    why: "The polished ruin bar: strings of lights, Middle Eastern plates",
    ...OSM,
    source_url: "https://www.openstreetmap.org/node/3990944430",
    ...photo("Mazel Tov Ruin Bar (42253982234).jpg", "Nan Palmero", "CC BY 2.0"),
  }),
  a38: card({
    id: "wv:en:Budapest/South Buda#drink:a38",
    title: "A38 Ship",
    subtitle: "Concerts on a Ukrainian cargo ship",
    district: "South Buda",
    category: "drink",
    price_tier: 2,
    hours: "11:00–23:00",
    lat: 47.4756,
    lon: 19.0605,
    why: "Live music below deck, the Danube above it",
    source_url: "https://en.wikivoyage.org/wiki/Budapest/South_Buda#Drink",
    ...photo("A38 (ship, Budapest).JPG", "Rakás", "CC BY-SA 4.0"),
  }),
  bastionNight: card({
    id: "wp:en:3733065#s0-c1",
    title: "Fisherman's Bastion by night",
    district: "Budavár",
    category: "do",
    hours: "1 h",
    lat: 47.5022,
    lon: 19.0348,
    why: "Free after dark, the Parliament lit up across the river",
    ...WIKIPEDIA,
    source_url: "https://en.wikipedia.org/wiki/Fisherman%27s_Bastion",
    ...photo(
      "Fisherman's Bastion, Budapest by night - panoramio (6).jpg",
      "Nikolai Karaneschev",
      "CC BY 3.0"
    ),
  }),
};

/**
 * Where a "Change" draws from, by part of the day: what is already in the
 * trip is skipped, so with three days there are always three fresh cards.
 */
export const POOLS: Record<DayPart, OptionCard[]> = {
  morning: [
    ACTIVITIES.greatMarket,
    ACTIVITIES.fishermansBastion,
    ACTIVITIES.parliament,
    MORE.matthiasChurch,
    MORE.heroesSquare,
    MORE.vajdahunyad,
    MORE.houseOfTerror,
    MORE.shoes,
    EXTRAS.margaretIsland,
  ],
  afternoon: [
    EXTRAS.basilica,
    BATHS.gellert,
    ACTIVITIES.synagogue,
    BATHS.rudas,
    BATHS.szechenyi,
    BATHS.veliBej,
    MORE.lukacs,
    MORE.citadella,
    MORE.varosliget,
    EXTRAS.opera,
  ],
  evening: [
    RESTAURANTS.menza,
    RESTAURANTS.friciPapa,
    EXTRAS.newYorkCafe,
    RESTAURANTS.langos,
    EXTRAS.gerbeaud,
    ACTIVITIES.castleLunch,
    MORE.ruszwurm,
  ],
  night: [
    ACTIVITIES.danubeWalk,
    ACTIVITIES.szimpla,
    MORE.mazelTov,
    EXTRAS.gozsdu,
    MORE.a38,
    MORE.bastionNight,
    EXTRAS.libertyBridge,
  ],
};

/** Every card the session knows, by id (the demo resolves selections with it). */
export const ALL_CARDS: Record<string, OptionCard> = Object.fromEntries(
  [NEIGHBOURHOODS, HOTELS, BATHS, ACTIVITIES, RESTAURANTS, EXTRAS, MORE]
    .flatMap((group) => Object.values(group))
    .map((c) => [c.id, c])
);

// ─── The itinerary ────────────────────────────────────────────────────────────

export const FIRST_ITINERARY_OPS: ItineraryOp[] = [
  { op: "set_stay", card: HOTELS.rum },
  {
    op: "set_route",
    origin: "Madrid",
    destination: "Budapest",
    outbound_date: "2026-10-23",
    return_date: "2026-10-25",
    deep_link: "https://www.google.com/travel/flights?q=Flights%20from%20MAD%20to%20BUD",
  },
  { op: "set_day_title", day: 1, title: "Arrival: Belváros and the Danube" },
  { op: "set_day_title", day: 2, title: "Buda: the castle and thermal baths" },
  { op: "set_day_title", day: 3, title: "Monumental Pest and the Jewish Quarter" },
  { op: "set_weather", day: 1, summary: "Cloudy", t_max: 14, t_min: 7, source: "Open-Meteo" },
  { op: "set_weather", day: 2, summary: "Sunny", t_max: 13, t_min: 6, source: "Open-Meteo" },
  { op: "set_weather", day: 3, summary: "Rain", t_max: 12, t_min: 6, source: "Open-Meteo" },
  { op: "put_activity", slot: { day: 1, part: "morning" }, card: ACTIVITIES.greatMarket },
  { op: "put_activity", slot: { day: 1, part: "afternoon" }, card: EXTRAS.basilica },
  { op: "put_activity", slot: { day: 1, part: "evening" }, card: RESTAURANTS.menza },
  { op: "put_activity", slot: { day: 1, part: "night" }, card: ACTIVITIES.danubeWalk },
  { op: "put_activity", slot: { day: 2, part: "morning" }, card: ACTIVITIES.fishermansBastion },
  { op: "put_activity", slot: { day: 2, part: "afternoon" }, card: BATHS.gellert },
  { op: "put_activity", slot: { day: 2, part: "evening" }, card: RESTAURANTS.friciPapa },
  { op: "put_activity", slot: { day: 2, part: "night" }, card: ACTIVITIES.szimpla },
  { op: "put_activity", slot: { day: 3, part: "morning" }, card: ACTIVITIES.parliament },
  { op: "put_activity", slot: { day: 3, part: "afternoon" }, card: ACTIVITIES.synagogue },
  { op: "put_activity", slot: { day: 3, part: "evening" }, card: EXTRAS.newYorkCafe },
  { op: "put_activity", slot: { day: 3, part: "night" }, card: MORE.mazelTov },
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
    "3 days in Budapest from Madrid with my partner, late October. We love food, thermal baths and history.",
  dates: "Dates: 2026-10-23 to 2026-10-25",
  generate: "Generate the trip",
  alternatives: "Alternatives for day 2 · afternoon",
} as const;

export const GROUP_IDS = {
  neighbourhoods: "g-neighbourhoods",
  hotels: "g-hotels",
  baths: "g-baths-day2-afternoon",
  restaurants: "g-restaurants-day1-evening",
} as const;

export const GROUPS = {
  neighbourhoods: {
    group_id: GROUP_IDS.neighbourhoods,
    kind: "neighbourhood",
    prompt: "Where would you like to stay?",
    slot: null,
    selection: "single",
    cards: [NEIGHBOURHOODS.belvaros, NEIGHBOURHOODS.erzsebetvaros, NEIGHBOURHOODS.budavar],
  },
  hotels: {
    group_id: GROUP_IDS.hotels,
    kind: "hotel",
    prompt: "Pick a hotel",
    slot: null,
    selection: "single",
    cards: [HOTELS.rum, HOTELS.mercure, HOTELS.basilica],
  },
  baths: {
    group_id: GROUP_IDS.baths,
    kind: "experience",
    prompt: "Thermal baths for day 2 · afternoon",
    slot: { day: 2, part: "afternoon" },
    selection: "single",
    cards: [BATHS.rudas, BATHS.szechenyi, BATHS.veliBej],
  },
  restaurants: {
    group_id: GROUP_IDS.restaurants,
    kind: "restaurant",
    prompt: "Hungarian restaurants near your hotel",
    slot: { day: 1, part: "evening" },
    selection: "single",
    cards: [RESTAURANTS.menza, RESTAURANTS.friciPapa, RESTAURANTS.langos],
  },
} as const satisfies Record<string, OptionsGroup>;

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
    { type: "options", ...GROUPS.neighbourhoods },
    { type: "done" },
  ],
  neighbourhood: [
    { type: "text", delta: "These mid-range hotels are in Belváros or very close:" },
    { type: "options", ...GROUPS.hotels },
    { type: "done" },
  ],
  hotel: [
    { type: "itinerary_patch", ops: FIRST_ITINERARY_OPS },
    {
      type: "text",
      delta: "Done. I've put together a first 3-day itinerary, every part of the day filled; press Change on any slot to see alternatives.",
    },
    { type: "done" },
  ],
  alternatives: [
    { type: "text", delta: "Here are alternatives for day 2 · afternoon. Rudas fits best after the castle." },
    { type: "options", ...GROUPS.baths },
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
