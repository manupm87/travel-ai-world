"""WeatherForecast adapter over Open-Meteo's public forecast API.

No key and no account: the free endpoint answers a plain GET. One instance per
process owns an `httpx.AsyncClient` that the app lifespan closes.

Weather never fails a plan. Beyond the forecast horizon (about two weeks) there
is nothing to ask for, and a slow or broken upstream is not worth an error the
traveller would see: both cases return no days at all and the caller falls back
to climate normals.
"""

import logging
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

import httpx

from ai_api.config import AISettings
from ai_api.domain.models import DayWeather

logger = logging.getLogger(__name__)

SOURCE = "open-meteo"

# The daily variables we ask for, in the order the API returns them.
DAILY_VARIABLES = "temperature_2m_max,temperature_2m_min,weathercode"

# WMO 4677 weather codes, as short as a card can print them. The table is
# deliberately coarse: a planner says "rain", not "moderate drizzle".
_SUMMARIES: dict[int, str] = {
    0: "clear",
    1: "mainly clear",
    2: "partly cloudy",
    3: "overcast",
    45: "fog",
    48: "freezing fog",
    51: "light drizzle",
    53: "drizzle",
    55: "heavy drizzle",
    56: "freezing drizzle",
    57: "freezing drizzle",
    61: "light rain",
    63: "rain",
    65: "heavy rain",
    66: "freezing rain",
    67: "freezing rain",
    71: "light snow",
    73: "snow",
    75: "heavy snow",
    77: "snow grains",
    80: "showers",
    81: "showers",
    82: "heavy showers",
    85: "snow showers",
    86: "heavy snow showers",
    95: "thunderstorm",
    96: "thunderstorm with hail",
    99: "thunderstorm with hail",
}

# A code we do not know still has to read like weather.
UNKNOWN_SUMMARY = "changeable"


class OpenMeteoForecast:
    name = "open-meteo"

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        base_url: str = "https://api.open-meteo.com/v1/forecast",
        horizon_days: int = 16,
        timezone: str = "Europe/Budapest",
        today: Callable[[], date] | None = None,
    ) -> None:
        self._client = client
        self._base_url = base_url
        self._horizon_days = horizon_days
        self._timezone = timezone
        self._today = today or date.today

    @classmethod
    def from_settings(cls, settings: AISettings) -> "OpenMeteoForecast":
        """Build the process-wide instance from `AISettings`."""
        timeout = httpx.Timeout(
            connect=settings.OPEN_METEO_TIMEOUT,
            read=settings.OPEN_METEO_TIMEOUT,
            write=5.0,
            pool=5.0,
        )
        return cls(
            httpx.AsyncClient(timeout=timeout),
            base_url=settings.OPEN_METEO_URL,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def daily(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[DayWeather]:
        """The forecast for these days, or nothing at all.

        Days the upstream does not return are simply absent: a trip that
        starts inside the horizon and ends outside it gets the days it can.
        """
        horizon = self._today() + timedelta(days=self._horizon_days)
        if start > horizon:
            logger.debug("Open-Meteo skipped: %s is beyond the forecast horizon", start)
            return []
        last = min(end, horizon)
        if last < start:
            return []

        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": DAILY_VARIABLES,
            "timezone": self._timezone,
            "start_date": start.isoformat(),
            "end_date": last.isoformat(),
        }
        try:
            response = await self._client.get(self._base_url, params=params)
            if response.status_code != 200:
                logger.warning(
                    "Open-Meteo answered %s: %s",
                    response.status_code,
                    response.text[:200],
                )
                return []
            payload = response.json()
        except httpx.HTTPError as exc:
            logger.warning("Open-Meteo unreachable: %s", exc)
            return []
        except ValueError as exc:  # json.JSONDecodeError
            logger.warning("Open-Meteo answered with malformed JSON: %s", exc)
            return []
        return _days(payload)


def _days(payload: Any) -> list[DayWeather]:
    """Open-Meteo's parallel arrays as one `DayWeather` per day it returned."""
    daily = payload.get("daily") if isinstance(payload, dict) else None
    if not isinstance(daily, dict):
        logger.warning("Open-Meteo answered without a daily block")
        return []

    times = daily.get("time") or []
    highs = daily.get("temperature_2m_max") or []
    lows = daily.get("temperature_2m_min") or []
    codes = daily.get("weathercode") or []

    days: list[DayWeather] = []
    for index, raw_day in enumerate(times):
        day = _day(raw_day)
        if day is None:
            continue
        days.append(
            DayWeather(
                day=day,
                summary=_summary(_at(codes, index)),
                t_max=_temperature(_at(highs, index)),
                t_min=_temperature(_at(lows, index)),
                source=SOURCE,
            )
        )
    return days


def _at(values: Any, index: int) -> Any:
    """The nth value of a variable, or None when the array is shorter."""
    if not isinstance(values, list) or index >= len(values):
        return None
    return values[index]


def _day(raw: Any) -> date | None:
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        logger.warning("Open-Meteo returned an unreadable date: %s", raw)
        return None


def _summary(code: Any) -> str:
    try:
        return _SUMMARIES.get(int(code), UNKNOWN_SUMMARY)
    except (TypeError, ValueError):
        return UNKNOWN_SUMMARY


def _temperature(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
