"""Constrained scalar types reused across schemas, so a format is defined once."""

from decimal import Decimal
from typing import Annotated

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


def _as_list(value: object) -> object:
    return [value] if isinstance(value, str) else value


StringList = Annotated[list[str], BeforeValidator(_as_list)]
"""Accepts a bare string for convenience and always stores a list."""
