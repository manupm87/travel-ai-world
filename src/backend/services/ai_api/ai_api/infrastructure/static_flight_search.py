"""How to get there, without pretending to be a travel agency.

We sell nothing and quote nothing: a route is a prefilled flight search the
traveller opens themselves, so no price, no schedule and no availability can go
stale between the plan and the booking. Nothing here calls the network — only a
small table of the airports we plan between, so a city written "Múnich",
"München" or "munich" ends up as the same code in the link.
"""

import json
import unicodedata
from datetime import date
from importlib.resources import files
from urllib.parse import quote

from ai_api.domain.models import RouteSuggestion

# Google Flights takes a natural-language query; everything after `q=` is the
# search we would have typed.
SEARCH_URL = "https://www.google.com/travel/flights?q="


def _fold(text: str) -> str:
    """Lower-case and accent-free, so "Málaga" and "malaga" are one city."""
    decomposed = unicodedata.normalize("NFKD", text.strip().lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _load_airports() -> dict[str, str]:
    """Every spelling we accept, mapped to its IATA code. Read once at import."""
    raw = (files("ai_api") / "data" / "airports.json").read_text(encoding="utf-8")
    table: dict[str, str] = {}
    for entry in json.loads(raw):
        code = str(entry["iata"])
        for name in (code, str(entry["city"]), *entry.get("aliases", ())):
            table[_fold(str(name))] = code
    return table


_BY_NAME = _load_airports()


def resolve_iata(city: str) -> str | None:
    """The IATA code for a city, however it was written; None when unknown."""
    return _BY_NAME.get(_fold(city))


def route_for(
    origin: str,
    destination: str,
    outbound: date | None,
    inbound: date | None,
) -> RouteSuggestion:
    """A flight search for this trip. A city we do not know keeps its name:
    the search still works, it is just less precise."""
    origin_iata = resolve_iata(origin)
    destination_iata = resolve_iata(destination)
    query = (
        f"Flights from {origin_iata or origin.strip()} "
        f"to {destination_iata or destination.strip()}"
    )
    if outbound is not None:
        query += f" on {outbound.isoformat()}"
    if inbound is not None:
        query += f" returning {inbound.isoformat()}"
    return RouteSuggestion(
        origin=origin,
        destination=destination,
        origin_iata=origin_iata,
        destination_iata=destination_iata,
        deep_link=SEARCH_URL + quote(query),
    )
