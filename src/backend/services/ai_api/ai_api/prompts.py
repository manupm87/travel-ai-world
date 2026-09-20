"""Prompts. Kept out of code paths so they can be tuned in isolation."""

from collections.abc import Iterable, Sequence

from ai_api.domain.models import City, Document

CHAT_SYSTEM_PROMPT = (
    "You are the Travel AI World planning assistant. Turn the user's trip idea "
    "into a concrete, day-by-day itinerary: ask for whatever is missing (dates, "
    "budget, number of travellers, pace) instead of guessing, and keep every "
    "suggestion specific and practical. Reply in the language the user writes in."
)

RAG_CONTEXT_PROMPT = (
    "Background information retrieved from the Travel AI World city corpus. "
    "Prefer it over your own knowledge, name the places it mentions, and never "
    "invent places, prices or opening hours it does not give. If it does not "
    "cover the question, say so briefly and answer from general knowledge.\n\n"
    "{context}"
)
"""Second system turn carrying retrieved passages; `{context}` is filled in."""


def format_context(documents: Iterable[Document]) -> str:
    """The passages as the model reads them.

    Each keeps the little that makes it usable — what it is called, what kind
    of place it is, where in the city, and where it came from — so the model
    can tell a bath from a museum and offer a link.
    """
    return "\n\n".join(_passage(document) for document in documents)


def _passage(document: Document) -> str:
    metadata = document.metadata
    heading = " · ".join(
        str(value)
        for value in (
            metadata.get("name") or metadata.get("heading_path"),
            metadata.get("category"),
            metadata.get("district"),
        )
        if value
    )
    source = metadata.get("url") or metadata.get("source_url")
    lines = [line for line in (heading, document.content) if line]
    if source:
        lines.append(f"Source: {source}")
    return "\n".join(lines)


# ─── Planner (ADR 0015) ──────────────────────────────────────────────────────
#
# The planner never lets the model write a place: it extracts, ranks, picks ids
# and explains. Every prompt says which language to answer in, because the
# service keeps no state and decides it again each turn.

LANGUAGE_NAMES = {"en": "English", "es": "Spanish"}

PLANNER_PERSONA = (
    "You are the Travel AI World trip planner. You plan city trips from a "
    "curated corpus of places (Wikivoyage, Wikipedia, OpenStreetMap). You never "
    "invent a place, a price, an opening time or a flight; prices are only ever "
    "tiers (€, €€, €€€). You write in {language}, briefly and warmly."
)

BRIEF_EXTRACTION_PROMPT = (
    "Today is {today}. Read the user's latest message (and the transcript, if "
    "any) and update the trip brief. Return only the fields the message gives "
    "or changes; leave the rest null. Rules: `destination` and `origin` are "
    "city names in English (Madrid, Vienna); the destinations this planner "
    "covers, with the spellings travellers use, are: {cities}. When the "
    "message names one of them in any spelling, write its English name "
    "exactly as listed; any other destination is written as the user said it. "
    "Dates are ISO `YYYY-MM-DD` "
    "(resolve relative dates from today; a range like '20-24 October' is "
    "start 20, end 24 of the coming October); `nights` = end minus start when "
    "both are known; `budget_tier` 1 = cheap/low, 2 = mid-range/medium, "
    "3 = high-end; `interests` are short lowercase tags from this list when "
    "they fit: food, thermal_baths, history, architecture, nightlife, museums, "
    "nature, shopping, art, music, family; `pace` relaxed/balanced/intense. "
    "A message like 'Dates: 2026-10-20 · 2026-10-24' or 'Leaving from Madrid · "
    "2 adults' is the user answering a checklist: read it literally.\n\n"
    "Current brief:\n{brief}"
)

ASK_MISSING_PROMPT = (
    "The brief still lacks: {missing}. Ask one short, friendly question about "
    "the first of them ({first}), in {language}, at most two sentences. Do not "
    "list what you already know and do not suggest places yet."
)

RANK_NEIGHBOURHOODS_PROMPT = (
    "The traveller's brief:\n{brief}\n\nCandidate neighbourhoods of "
    "{city}, one per line as `id | name | summary`:\n{candidates}\n\n"
    "Pick the {count} best neighbourhoods to stay in for this trip. For each, "
    "one sentence (under 140 characters, in {language}) saying why it fits "
    "these travellers. Use only ids from the list."
)

PICK_HOTELS_PROMPT = (
    "The traveller's brief:\n{brief}\n\nCandidate places to stay in "
    "{district}, one per line as `id | name | tier | summary`:\n{candidates}\n\n"
    "Pick the {count} best for these travellers and their budget. For each, one "
    "sentence (under 140 characters, in {language}) saying why. Never mention a "
    "price; tiers only. Use only ids from the list."
)

SKELETON_PROMPT = (
    "The traveller's brief:\n{brief}\n\nThey stay in {stay_district}. The trip "
    "has {days} days ({dates}). Districts the corpus covers, one per line as "
    "`name | summary`:\n{districts}\n\n"
    "Design a skeleton: for each day a short title (in {language}, under 60 "
    "characters, no prices), one or two districts to spend it in (names exactly "
    "as listed; keep each day compact and make day 1 close to the stay), and a "
    "one-line theme drawn from the interests. Vary the days; thermal baths, "
    "when wanted, get an afternoon."
)

DAY_PICKS_PROMPT = (
    "The traveller's brief:\n{brief}\n\nDay {day} of {days}: '{title}' — "
    "{theme}. Districts: {districts}. Weekday: {weekday}.\n\n"
    "Candidates per part of the day, one per line as `id | name | category | "
    "district | tier | summary`:\n{candidates}\n\n"
    "Choose exactly {plan} from the corresponding lists (a list with fewer "
    "entries than asked: take what there is). Prefer places that sit well "
    "together and match the theme; among equals prefer one marked `photo`; do "
    "not pick the same place twice. For each "
    "pick, one sentence (under 140 characters, in {language}) saying why it "
    "belongs here. Never mention a price. Use only ids from the lists."
)

PICK_OPTIONS_PROMPT = (
    'The traveller\'s brief:\n{brief}\n\nThe user asked: "{request}" '
    "({context}). Candidates, one per line as `id | name | category | district "
    "| tier | summary`:\n{candidates}\n\n"
    "Pick the {count} that best answer the request. For each, one sentence "
    "(under 140 characters, in {language}) saying why. Never mention a price. "
    "Use only ids from the list."
)

INTENT_PROMPT = (
    "The traveller has an itinerary in {city}:\n{itinerary}\n\nClassify their "
    "latest message. `find_options` only when they ask for suggestions, "
    "alternatives or more places to add (set `kind`: experience for sights, "
    "activities, baths and tours; restaurant for eating or drinking; `day` and "
    "`part` when they name them; `query` is a short search text in English "
    "describing what to find). `change_stay` when they want another hotel "
    "(`cheaper` when they want to spend less). `chat` for everything else: a "
    "question about a place or the city (is it old? how do I get there? is it "
    "worth it?), an opinion, thanks, small talk. Examples: 'restaurantes "
    "húngaros cerca del día 2' → find_options, restaurant, day 2, query "
    "'Hungarian restaurant'; 'is there something to do at Margaret Island?' → "
    "find_options, experience, no day, query 'Margaret Island'; 'something "
    "cheaper' → change_stay, cheaper; '¿Es antiguo el baño Rudas?' → chat; "
    "'what's the weather like in October?' → chat."
)

CHAT_INTRO = (
    "Answer the traveller's question about their trip using the passages below "
    "when they help; keep it short and in {language}. The itinerary so far:\n"
    "{itinerary}"
)

# Deterministic wording per language for the turns that need no model.
PLANNER_TEXTS: dict[str, dict[str, str]] = {
    "en": {
        "not_covered": (
            "For now I can plan {cities}: the corpus does not cover "
            "{destination} yet. Shall we plan one of those?"
        ),
        "neighbourhoods": (
            "These neighbourhoods fit your trip. Where would you like to stay?"
        ),
        "no_neighbourhoods": "I could not find neighbourhoods for that city yet.",
        "hotels": "These places to stay are in or near {district}:",
        "no_hotels": "I found no places to stay matching that; try another area.",
        "stay_set": "{title} is your stay. Building the days now…",
        "stay_changed": "{title} is now your stay; the days stay as they were.",
        "draft_done": (
            "Done: a first {days}-day itinerary, every part of the day filled. "
            "Press Change on any slot for alternatives, or tell me what to adjust."
        ),
        "alternatives": "Alternatives for day {day} · {part}:",
        "options": "Here is what I found:",
        "mentioned": "Add any of these to your trip:",
        "no_options": "I could not find anything matching that in the corpus.",
        "added": "Added {titles} to day {day}.",
        "removed": "Removed it from day {day}.",
        "stale_group": "That list is gone; ask me again and I will bring fresh options.",
        "acknowledged": "Noted. Anything else to adjust?",
        "weather_normals": "Typical {month}: highs {t_max:.0f} °C, lows {t_min:.0f} °C",
        "day_title": "Day {day}",
        "warn_too_far": "{a} → {b} is {km:.1f} km; plan transport",
        "warn_overloaded_day": "Day {day} has {count} activities for a {pace} pace",
        "warn_closed": "{title} looks closed on {weekday}",
        "warn_unverified_price": "Prices are not verified; check the venue.",
    },
    "es": {
        "not_covered": (
            "De momento puedo planificar {cities}: el corpus aún no cubre "
            "{destination}. ¿Planificamos una de ellas?"
        ),
        "neighbourhoods": "Estos barrios encajan con tu viaje. ¿Dónde te gustaría alojarte?",
        "no_neighbourhoods": "Todavía no encuentro barrios para esa ciudad.",
        "hotels": "Estos alojamientos están en {district} o muy cerca:",
        "no_hotels": "No encuentro alojamientos así; prueba otra zona.",
        "stay_set": "{title} es tu alojamiento. Preparando los días…",
        "stay_changed": "{title} es ahora tu alojamiento; los días quedan como estaban.",
        "draft_done": (
            "Listo: un primer itinerario de {days} días con cada parte del día "
            "cubierta. Pulsa Cambiar en cualquier franja para ver alternativas, "
            "o dime qué ajustar."
        ),
        "alternatives": "Alternativas para el día {day} · {part}:",
        "options": "Esto es lo que he encontrado:",
        "mentioned": "Añade cualquiera de estos a tu viaje:",
        "no_options": "No encuentro nada así en el corpus.",
        "added": "Añadido {titles} al día {day}.",
        "removed": "Quitado del día {day}.",
        "stale_group": "Esa lista ya no está; pídemelo otra vez y traigo opciones nuevas.",
        "acknowledged": "Anotado. ¿Algo más que ajustar?",
        "weather_normals": "Un {month} típico: máximas {t_max:.0f} °C, mínimas {t_min:.0f} °C",
        "day_title": "Día {day}",
        "warn_too_far": "{a} → {b} están a {km:.1f} km; prevé transporte",
        "warn_overloaded_day": "El día {day} tiene {count} actividades para un ritmo {pace}",
        "warn_closed": "{title} parece cerrado el {weekday}",
        "warn_unverified_price": "Los precios no están verificados; consulta el local.",
    },
}

WEEKDAY_NAMES: dict[str, list[str]] = {
    "en": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
    ],
    "es": ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
}

PACE_NAMES: dict[str, dict[str, str]] = {
    "en": {"relaxed": "relaxed", "balanced": "balanced", "intense": "intense"},
    "es": {"relaxed": "tranquilo", "balanced": "equilibrado", "intense": "intenso"},
}

PART_NAMES: dict[str, dict[str, str]] = {
    "en": {
        "morning": "morning",
        "afternoon": "afternoon",
        "evening": "evening",
        "night": "night",
    },
    "es": {
        "morning": "mañana",
        "afternoon": "tarde",
        "evening": "atardecer",
        "night": "noche",
    },
}


def planner_text(language: str, key: str, **values: object) -> str:
    """A fixed sentence in the user's language (English when unknown)."""
    texts = PLANNER_TEXTS.get(language) or PLANNER_TEXTS["en"]
    return texts[key].format(**values)


LIST_CONJUNCTIONS = {"en": "and", "es": "y"}


def join_names(names: Sequence[str], language: str) -> str:
    """`Budapest and Bologna` / `Budapest y Bolonia`, for a sentence."""
    conjunction = LIST_CONJUNCTIONS.get(language, LIST_CONJUNCTIONS["en"])
    if len(names) <= 1:
        return "".join(names)
    return f"{', '.join(names[:-1])} {conjunction} {names[-1]}"


def cities_for_prompt(cities: Sequence[City]) -> str:
    """`Budapest (budapest); Bologna (bologna, bolonia)`: the covered cities
    and their spellings, for the brief extraction prompt."""
    return "; ".join(
        f"{city.name} ({', '.join(dict.fromkeys((city.slug, *city.aliases)))})"
        for city in cities
    )
