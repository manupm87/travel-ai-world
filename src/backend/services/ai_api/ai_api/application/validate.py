"""Pure checks over a placed itinerary: no I/O, nothing async.

A `Placed` pairs the slot the planner put a card in with the card itself, so
these functions never need to look anything up. Every check returns `WarnOp`s
the same way the planner streams them, so the use case only has to `extend`
the itinerary patch with whatever comes back.
"""

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from itertools import pairwise

from ai_api.schemas.planner_events import (
    DAY_PARTS,
    DayPart,
    OptionCard,
    Pace,
    Slot,
    WarnOp,
    warn,
)

_EARTH_RADIUS_KM = 6371.0088

_LOAD_LIMITS: dict[Pace, int] = {"relaxed": 3, "balanced": 4, "intense": 6}
_DEFAULT_PACE: Pace = "balanced"

_PART_ORDER = {part: index for index, part in enumerate(DAY_PARTS)}


@dataclass(frozen=True, slots=True)
class Placed:
    """One card the planner has put somewhere in the trip."""

    slot: Slot
    card: OptionCard


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points, in kilometres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _part_rank(part: DayPart | None) -> int:
    return _PART_ORDER[part] if part is not None else len(DAY_PARTS)


def _ordered(placed: Sequence[Placed]) -> list[Placed]:
    """By day, then by day part (unpinned parts last), keeping input order."""
    indexed = list(enumerate(placed))
    indexed.sort(
        key=lambda pair: (
            pair[1].slot.day,
            _part_rank(pair[1].slot.part),
            pair[0],
        )
    )
    return [item for _, item in indexed]


def distance_warnings(placed: Sequence[Placed], *, max_km: float = 3.5) -> list[WarnOp]:
    """`too_far` between consecutive activities of the same day."""
    ordered = _ordered(placed)
    warnings: list[WarnOp] = []
    for previous, current in pairwise(ordered):
        if previous.slot.day != current.slot.day:
            continue
        if previous.card.lat is None or previous.card.lon is None:
            continue
        if current.card.lat is None or current.card.lon is None:
            continue
        distance = haversine_km(
            previous.card.lat, previous.card.lon, current.card.lat, current.card.lon
        )
        if distance > max_km:
            warnings.append(
                warn(
                    "too_far",
                    f"{previous.card.title} → {current.card.title} is "
                    f"{distance:.1f} km; plan transport",
                    slot=current.slot,
                )
            )
    return warnings


def load_warning(day: int, count: int, pace: Pace | None) -> WarnOp | None:
    """`overloaded_day` when a day carries more than its pace's limit."""
    limit = _LOAD_LIMITS[pace] if pace in _LOAD_LIMITS else _LOAD_LIMITS[_DEFAULT_PACE]
    if count <= limit:
        return None
    return warn(
        "overloaded_day",
        f"Day {day} has {count} activities for a {pace or _DEFAULT_PACE} pace",
        slot=Slot(day=day, part=None),
    )


# ─── "closed on this weekday" from free-text hours ────────────────────────

_DAY_ALIASES: dict[str, int] = {
    "mo": 0,
    "mon": 0,
    "monday": 0,
    "tu": 1,
    "tue": 1,
    "tues": 1,
    "tuesday": 1,
    "we": 2,
    "wed": 2,
    "wednesday": 2,
    "th": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "thursday": 3,
    "fr": 4,
    "fri": 4,
    "friday": 4,
    "sa": 5,
    "sat": 5,
    "saturday": 5,
    "su": 6,
    "sun": 6,
    "sunday": 6,
}
_DAY_TOKENS = "|".join(sorted(_DAY_ALIASES, key=len, reverse=True))
_DASHES = "-–"  # noqa: RUF001 — hyphen and the en dash hours are often typeset with
_DAY_RUN_RE = re.compile(
    rf"\b(?:{_DAY_TOKENS})s?(?:\s*[{_DASHES},/]\s*(?:{_DAY_TOKENS})s?)*\b",
    re.IGNORECASE,
)
_DAY_RANGE_RE = re.compile(
    rf"^(?:{_DAY_TOKENS})s?\s*[{_DASHES}]\s*(?:{_DAY_TOKENS})s?$", re.IGNORECASE
)
_TIME_AFTER_RE = re.compile(
    rf"^\s*(?:from\s+)?\d{{1,2}}([:.]\d{{2}})?\s*h?\s*(?:[{_DASHES}]|to)"
    rf"\s*\d{{1,2}}([:.]\d{{2}})?\s*h?",
    re.IGNORECASE,
)
_CLOSED_BEFORE_RE = re.compile(r"closed\s*(?:on\s*)?$", re.IGNORECASE)
_CLOSED_AFTER_RE = re.compile(r"^\s*(?:is\s+)?closed\b", re.IGNORECASE)
_OFF_AFTER_RE = re.compile(r"^\s*off\b", re.IGNORECASE)
_OPEN_ALWAYS_RE = re.compile(
    r"\b(daily|every\s*day|24/7|24-7|around the clock)\b", re.IGNORECASE
)
_MIN_OPEN_DAYS_TO_INFER_CLOSED = 5


def _weekday_from_word(word: str) -> int | None:
    key = word.lower()
    if key not in _DAY_ALIASES and key.endswith("s"):
        key = key[:-1]
    return _DAY_ALIASES.get(key)


def _expand_run(run: str) -> set[int]:
    days: set[int] = set()
    for group in re.split(r"[,/]", run):
        group = group.strip()
        if not group:
            continue
        if _DAY_RANGE_RE.match(group):
            start_word, end_word = re.split(rf"\s*[{_DASHES}]\s*", group, maxsplit=1)
            start, end = _weekday_from_word(start_word), _weekday_from_word(end_word)
            if start is not None and end is not None:
                days |= _range_days(start, end)
            continue
        single = _weekday_from_word(group)
        if single is not None:
            days.add(single)
    return days


def _range_days(start: int, end: int) -> set[int]:
    if start <= end:
        return set(range(start, end + 1))
    return set(range(start, 7)) | set(range(0, end + 1))


def is_closed_on(hours: str | None, weekday: int) -> bool:
    """Whether free-text hours clearly say closed on `weekday` (0 = Monday).

    Conservative on purpose: only an explicit "closed Mon" / "Mo off" style
    statement, or a day range that visibly omits the day (e.g. "Tu-Su
    10:00-18:00"), returns True. Anything unparseable — "daily", "Mo-Su",
    "24/7", seasonal prose — returns False; a missed warning beats a false one.
    """
    if not hours:
        return False
    text = hours.strip()
    if not text or _OPEN_ALWAYS_RE.search(text):
        return False

    closed_days: set[int] = set()
    open_days: set[int] = set()
    for match in _DAY_RUN_RE.finditer(text):
        days = _expand_run(match.group(0))
        if not days:
            continue
        before = text[max(0, match.start() - 20) : match.start()]
        after = text[match.end() : match.end() + 30]
        if (
            _CLOSED_BEFORE_RE.search(before)
            or _CLOSED_AFTER_RE.match(after)
            or _OFF_AFTER_RE.match(after)
        ):
            closed_days |= days
        elif _TIME_AFTER_RE.match(after):
            open_days |= days

    if weekday in closed_days:
        return True
    return len(open_days) >= _MIN_OPEN_DAYS_TO_INFER_CLOSED and weekday not in open_days


def closed_warnings(placed: Sequence[Placed], on: Mapping[int, date]) -> list[WarnOp]:
    """`closed` for a card whose hours say it is shut on its day's weekday."""
    warnings: list[WarnOp] = []
    for item in placed:
        day_date = on.get(item.slot.day)
        if day_date is None:
            continue
        if is_closed_on(item.card.hours, day_date.weekday()):
            warnings.append(
                warn(
                    "closed",
                    f"{item.card.title} looks closed on {day_date.strftime('%A')}",
                    slot=item.slot,
                )
            )
    return warnings


# ─── prices in model-written text ──────────────────────────────────────────

_CURRENCY_SYMBOLS = "€$£"
_CURRENCY_WORDS = "EUR|USD|GBP|HUF|Ft"
_AMOUNT = r"\d+(?:[.,]\d+)*"
_PRICE_RE = re.compile(
    rf"""
    (?:[{_CURRENCY_SYMBOLS}]|\b(?:{_CURRENCY_WORDS}))\s?{_AMOUNT}
    |{_AMOUNT}\s?(?:[{_CURRENCY_SYMBOLS}]|\b(?:{_CURRENCY_WORDS}))
    """,
    re.VERBOSE,
)


def strip_prices(text: str) -> tuple[str, bool]:
    """Redact amounts written with a currency; bare numbers (dates, counts,
    times) are left alone."""
    result, count = _PRICE_RE.subn("(price not shown)", text)
    return result, count > 0


def validate_day(
    day: int, placed: Sequence[Placed], *, pace: Pace | None, on: date | None
) -> list[WarnOp]:
    """Every warning for one day: distance, then load, then closed."""
    day_placed = [item for item in placed if item.slot.day == day]
    warnings = distance_warnings(day_placed)
    load = load_warning(day, len(day_placed), pace)
    if load is not None:
        warnings.append(load)
    if on is not None:
        warnings.extend(closed_warnings(day_placed, {day: on}))
    return warnings
