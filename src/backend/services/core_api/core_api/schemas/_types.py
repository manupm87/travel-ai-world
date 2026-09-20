"""Constrained scalar types reused across schemas, so a format is defined once."""

from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BeforeValidator, Field, StringConstraints

TimeOfDay = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
"""Wall-clock time as "HH:MM"."""


def _as_code(value: object) -> object:
    """Codes are compared upper-case; be lenient with what clients send."""
    return value.strip().upper() if isinstance(value, str) else value


CountryCode = Annotated[
    str, BeforeValidator(_as_code), StringConstraints(pattern=r"^[A-Z]{2,3}$")
]
"""ISO 3166-1 alpha-2 (preferred) or alpha-3."""

CurrencyCode = Annotated[
    str, BeforeValidator(_as_code), StringConstraints(pattern=r"^[A-Z]{3}$")
]
"""ISO 4217."""

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Rating = Annotated[float, Field(ge=0, le=5)]
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
Count = Annotated[int, Field(ge=0)]
PositiveMinutes = Annotated[int, Field(ge=0, le=60 * 24 * 31)]
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]
Place = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)
]
"""A place as a traveller writes it: a city, a country, a town they leave from."""

BudgetTier = Annotated[int, Field(ge=1, le=3)]
"""The planner's three price levels: 1 cheap, 2 mid, 3 splurge."""

PartOfDay = Literal["morning", "afternoon", "evening", "night"]
"""Where in the day a plan sits; the planner's slots, in order."""

SourceRef = Annotated[str, StringConstraints(min_length=1, max_length=255)]
"""The corpus document id a planner card came from (`osm:relation/13067`)."""

CardJson = dict[str, Any]
"""A planner card exactly as the client received it.

Opaque on purpose: core_api stores it and hands it back so a saved trip can
be reopened in the planner, and never reads inside it — the shape is ai_api's
(`OptionCard`) and the two services share no code (ADR 0001).
"""


def _as_slug(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


CitySlug = Annotated[
    str,
    BeforeValidator(_as_slug),
    StringConstraints(max_length=100, pattern=r"^[a-z]+(-[a-z]+)*$"),
]
"""City as the corpus names it: "madrid", "berlin", "budapest"."""

MessageText = Annotated[str, StringConstraints(min_length=1, max_length=100_000)]
"""One chat turn, kept verbatim."""


def _as_list(value: object) -> object:
    return [value] if isinstance(value, str) else value


StringList = Annotated[list[str], BeforeValidator(_as_list)]
"""Accepts a bare string for convenience and always stores a list."""
