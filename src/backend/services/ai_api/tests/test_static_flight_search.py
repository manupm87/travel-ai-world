"""The flight suggestion: a prefilled search, no prices, no network."""

import re
from datetime import date
from urllib.parse import unquote

from ai_api.infrastructure.static_flight_search import (
    SEARCH_URL,
    resolve_iata,
    route_for,
)


def _query(deep_link: str) -> str:
    assert deep_link.startswith(SEARCH_URL)
    return unquote(deep_link[len(SEARCH_URL) :])


def test_a_city_resolves_however_it_is_written():
    assert resolve_iata("Madrid") == "MAD"
    assert resolve_iata("  madrid ") == "MAD"
    assert resolve_iata("MAD") == "MAD"


def test_accents_and_native_spellings_resolve_to_the_same_airport():
    assert resolve_iata("Málaga") == resolve_iata("malaga") == "AGP"
    assert resolve_iata("München") == resolve_iata("munchen") == "MUC"
    assert resolve_iata("Wien") == resolve_iata("Viena") == "VIE"
    assert resolve_iata("Roma") == resolve_iata("Rome") == "FCO"
    assert resolve_iata("Nueva York") == resolve_iata("new york") == "JFK"
    assert resolve_iata("Lisboa") == "LIS"
    assert resolve_iata("Praha") == "PRG"
    assert resolve_iata("Londres") == "LHR"


def test_a_city_we_do_not_know_resolves_to_nothing():
    assert resolve_iata("Cuenca") is None
    assert resolve_iata("") is None


def test_the_deep_link_uses_the_codes_and_the_dates():
    route = route_for("Madrid", "Budapest", date(2026, 10, 3), date(2026, 10, 6))

    assert (route.origin_iata, route.destination_iata) == ("MAD", "BUD")
    assert route.origin == "Madrid"
    assert route.destination == "Budapest"
    assert _query(route.deep_link) == (
        "Flights from MAD to BUD on 2026-10-03 returning 2026-10-06"
    )
    # Spaces are encoded: the link is pasted whole into a browser.
    assert " " not in route.deep_link


def test_without_dates_the_search_is_just_the_route():
    route = route_for("Barcelona", "Roma", None, None)

    assert _query(route.deep_link) == "Flights from BCN to FCO"


def test_a_one_way_trip_keeps_only_the_outbound():
    route = route_for("Barcelona", "Roma", date(2026, 10, 3), None)

    assert _query(route.deep_link) == "Flights from BCN to FCO on 2026-10-03"


def test_an_unresolved_city_keeps_the_text_it_was_given():
    route = route_for("Cuenca", "Budapest", None, None)

    assert route.origin_iata is None
    assert route.origin == "Cuenca"
    assert _query(route.deep_link) == "Flights from Cuenca to BUD"


def test_a_suggestion_never_quotes_a_price():
    """We are not a travel agency: no amount may leak into a suggestion."""
    route = route_for("Málaga", "Nueva York", date(2026, 10, 3), date(2026, 10, 20))

    assert re.search(r"\d\s*(?:€|\$|EUR|USD)", unquote(route.deep_link)) is None
    assert re.search(r"(?:€|\$)\s*\d", unquote(route.deep_link)) is None
