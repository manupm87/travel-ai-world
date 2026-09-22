"""Curated hotel photos: `curated/<city>/hotels.toml` → a picture for a hotel
no open source can picture (TRA-211).

Some hotels cannot be pictured by any rule. A chain's booking platform answers
403 to anything that is not a browser, its preview is the brand's logo, and
Wikimedia Commons has never photographed a Courtyard by Marriott. Left alone,
those hotels leave the corpus (ADR 0022) — and a traveller looking for a stay in
Madrid should not find every hostal in it and no Four Seasons.

So the last source is a person: someone opens the hotel's page on the group's
own site in a real browser, takes the URL of the picture the hotel shows of
itself, and writes it down here with the page they read it on and the date. The
file is the twin of `curated/<city>/tours.toml` — same shape, same discipline:
facts from the operator's own site, never from a reseller, and every entry
carries the day it was checked.

Nothing is copied: `image_url` is hot-linked and credited exactly like the
photo the site publishes as its own preview, which is the bargain of ADR 0021
and ADR 0022. This module only reads and validates the file; `sources/photos.py`
binds each entry to its hotel and verifies the picture at build time.
"""

import datetime as dt
import logging
import tomllib
from pathlib import Path
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

logger = logging.getLogger(__name__)

STALE_AFTER_DAYS = 400
"""A hotel's photo outlives a tour's schedule: it is the same building, and the
URL either still answers or the card hides itself. Checked once a year is enough,
and a warning — never a build failure — says when a file has drifted past that."""

OSM_PREFIX = "osm:"
"""`match = "osm:node/4553094489"`: the hotel by its OpenStreetMap element,
for the second `Hotel Madrid` on the same street. Any other `match` is a name,
folded (lower case, accents dropped) before it is compared."""

NonEmpty = Annotated[str, Field(min_length=1)]


class HotelDataError(ValueError):
    """The curated file is malformed, or an entry names no hotel (or several);
    the message lists every problem with the file it came from."""


class CuratedHotel(BaseModel):
    """One `[[hotel]]` table."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    match: NonEmpty
    image_url: NonEmpty
    credit: NonEmpty
    """What the card prints beside the photo: the bare domain it was read from
    (`marriott.com`), or a Commons credit line for a file from Commons."""
    source_url: NonEmpty
    """The page the picture was read on, in a browser, by a person."""
    checked: dt.date
    note: str | None = None  # for maintainers; never published

    @field_validator("image_url", "source_url")
    @classmethod
    def _http(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("must be an http(s) URL")
        return value

    @property
    def osm_id(self) -> str | None:
        """The OpenStreetMap element this entry names, or None for a name match."""
        return (
            self.match.removeprefix(OSM_PREFIX)
            if self.match.startswith(OSM_PREFIX)
            else None
        )


def load(path: Path) -> list[CuratedHotel]:
    """Parse and validate the file; raise `HotelDataError` listing every problem.

    A city without the file has no curated photos, which is the normal case.
    """
    if not path.exists():
        return []
    try:
        raw = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise HotelDataError(f"{path}: {exc}") from exc
    unknown = sorted(set(raw) - {"hotel"})
    if unknown:
        raise HotelDataError(f"{path}: unknown table(s) {', '.join(unknown)}")
    problems: list[str] = []
    hotels: list[CuratedHotel] = []
    for index, entry in enumerate(raw.get("hotel", []), start=1):
        label = (
            entry.get("match", f"#{index}") if isinstance(entry, dict) else f"#{index}"
        )
        try:
            hotels.append(CuratedHotel.model_validate(entry))
        except ValidationError as exc:
            problems += [
                f"{label}.{'.'.join(map(str, e['loc']))}: {e['msg']}"
                for e in exc.errors()
            ]
    matches = [h.match for h in hotels]
    problems += [
        f"{m}: duplicate match"
        for m in sorted({m for m in matches if matches.count(m) > 1})
    ]
    if problems:
        raise HotelDataError(f"{path}:\n  " + "\n  ".join(problems))
    return sorted(hotels, key=lambda h: h.match)


def warn_stale(hotels: list[CuratedHotel], today: dt.date) -> list[str]:
    """The matches checked more than `STALE_AFTER_DAYS` ago (logged, not fatal)."""
    stale = [h.match for h in hotels if (today - h.checked).days > STALE_AFTER_DAYS]
    if stale:
        logger.warning(
            "curated hotel photos not checked for %d+ days: %s",
            STALE_AFTER_DAYS,
            ", ".join(stale),
        )
    return stale
