from city_corpus.config.cities import BUDAPEST
from city_corpus.models import CC_BY, Category, Source
from city_corpus.sources import climate

# Two Januaries and one February: aggregation must average per year, not pool days.
DAILY = {
    "daily": {
        "time": ["2024-01-01", "2024-01-02", "2025-01-01", "2025-01-02", "2025-02-01"],
        "temperature_2m_max": [2.0, 4.0, 0.0, None, 8.0],
        "temperature_2m_min": [-2.0, -4.0, -6.0, -8.0, 1.0],
        "precipitation_sum": [5.0, 0.5, 1.0, 3.0, None],
    }
}


def test_monthly_normals() -> None:
    january, february = climate.aggregate(DAILY)

    assert january.month == 1
    assert january.high_c == 2.0  # mean of 2, 4, 0 (None ignored)
    assert january.low_c == -5.0
    assert january.wet_days == 1.5  # 2024: 1 day >= 1 mm, 2025: 2 days
    assert january.rainfall_mm == 5  # (5.5 + 4.0) / 2 = 4.75 → 5
    assert january.years == 2
    assert (february.wet_days, february.rainfall_mm) == (0.0, 0)


def test_one_document_per_month() -> None:
    [january, _] = climate.documents(climate.aggregate(DAILY), BUDAPEST)

    assert january.doc_id == "om:climate:budapest:01"
    assert january.category == Category.CLIMATE
    assert (january.source, january.license) == (Source.OPEN_METEO, CC_BY)
    assert january.heading_path == "Budapest › Climate › January"
    assert january.text == (
        "Budapest in January: typical highs 2 °C and lows -5 °C, about 5 mm of rain "
        "spread over about 2 days with at least 1 mm (1996 to 2025 averages, "
        "Open-Meteo reanalysis)."
    )
