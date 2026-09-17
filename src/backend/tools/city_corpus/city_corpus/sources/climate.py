"""Open-Meteo historical weather → one climate-normals document per month.

Open-Meteo's archive is reanalysis (modelled) data. Its temperatures and rainfall
totals are close to Budapest's station normals. Its `sunshine_duration` is not: about
3,150 h a year against about 2,000 h measured. Sunshine is therefore left out, and
rain days (≥ 1 mm) run about a third higher than at the station, so the text says "about".
"""

import calendar
from collections import defaultdict
from dataclasses import dataclass
from statistics import fmean
from typing import Any

from city_corpus.config.cities import CityConfig
from city_corpus.http import ApiClient, Fetched
from city_corpus.models import CC_BY, Category, CorpusDocument, Kind, Source
from city_corpus.normalize import HEADING_SEPARATOR

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
SOURCE_URL = "https://open-meteo.com/en/docs/historical-weather-api"
FIRST_YEAR, LAST_YEAR = 1996, 2025
WET_DAY_MM = 1.0
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum"


@dataclass(frozen=True)
class MonthNormals:
    month: int
    high_c: float
    low_c: float
    wet_days: float
    rainfall_mm: float
    years: int


def fetch(client: ApiClient, city: CityConfig) -> Fetched:
    lat, lon = city.centre
    return client.get_json(
        ARCHIVE_URL,
        {
            "latitude": str(lat),
            "longitude": str(lon),
            "start_date": f"{FIRST_YEAR}-01-01",
            "end_date": f"{LAST_YEAR}-12-31",
            "daily": DAILY,
            "timezone": city.timezone,
        },
    )


def aggregate(data: dict[str, Any]) -> list[MonthNormals]:
    daily = data["daily"]
    highs: dict[int, list[float]] = defaultdict(list)
    lows: dict[int, list[float]] = defaultdict(list)
    wet: dict[tuple[int, int], int] = defaultdict(int)
    rain: dict[tuple[int, int], float] = defaultdict(float)
    years: dict[int, set[int]] = defaultdict(set)
    columns = zip(
        daily["time"],
        daily["temperature_2m_max"],
        daily["temperature_2m_min"],
        daily["precipitation_sum"],
        strict=True,
    )
    for day, high, low, precipitation in columns:
        year, month = int(day[:4]), int(day[5:7])
        years[month].add(year)
        if high is not None:
            highs[month].append(high)
        if low is not None:
            lows[month].append(low)
        if precipitation is not None:
            rain[(year, month)] += precipitation
            if precipitation >= WET_DAY_MM:
                wet[(year, month)] += 1
    normals: list[MonthNormals] = []
    for month in sorted(years):
        if not highs[month] or not lows[month]:
            continue
        n_years = len(years[month])
        normals.append(
            MonthNormals(
                month=month,
                high_c=round(fmean(highs[month]), 1),
                low_c=round(fmean(lows[month]), 1),
                wet_days=round(sum(wet[(y, month)] for y in years[month]) / n_years, 1),
                rainfall_mm=round(
                    sum(rain[(y, month)] for y in years[month]) / n_years
                ),
                years=n_years,
            )
        )
    return normals


def documents(normals: list[MonthNormals], city: CityConfig) -> list[CorpusDocument]:
    docs: list[CorpusDocument] = []
    for n in normals:
        month = calendar.month_name[n.month]
        heading_path = HEADING_SEPARATOR.join([city.name, "Climate", month])
        text = (
            f"{city.name} in {month}: typical highs {n.high_c:.0f} °C and lows "
            f"{n.low_c:.0f} °C, about {n.rainfall_mm:.0f} mm of rain spread over about "
            f"{n.wet_days:.0f} days with at least {WET_DAY_MM:.0f} mm "
            f"({FIRST_YEAR} to {LAST_YEAR} averages, Open-Meteo reanalysis)."
        )
        docs.append(
            CorpusDocument(
                doc_id=f"om:climate:{city.slug}:{n.month:02d}",
                city=city.slug,
                category=Category.CLIMATE,
                kind=Kind.PROSE,
                name=f"{city.name} climate in {month}",
                text=text,
                heading_path=heading_path,
                source=Source.OPEN_METEO,
                source_url=SOURCE_URL,
                license=CC_BY,
                lang="en",
            )
        )
    return docs
