"""OpenMeteoForecast against a mocked HTTP transport: no network, no key."""

import logging
from datetime import date

import httpx
from ai_api.config import AISettings
from ai_api.domain.models import DayWeather
from ai_api.infrastructure.open_meteo import OpenMeteoForecast

TODAY = date(2026, 9, 18)

PAYLOAD = {
    "daily": {
        "time": ["2026-09-20", "2026-09-21", "2026-09-22"],
        "temperature_2m_max": [27.4, 24.1, 19.0],
        "temperature_2m_min": [16.2, 15.0, 12.5],
        "weathercode": [0, 61, 123],
    }
}


def _forecast(handler, **kwargs) -> OpenMeteoForecast:
    return OpenMeteoForecast(
        httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        base_url="https://weather.test/v1/forecast",
        today=lambda: TODAY,
        **kwargs,
    )


def _ok(payload=PAYLOAD):
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=payload)

    return handler, seen


async def test_asks_for_the_requested_range_and_maps_every_day():
    handler, seen = _ok()

    days = await _forecast(handler).daily(
        47.5, 19.05, date(2026, 9, 20), date(2026, 9, 22)
    )

    params = seen[0].url.params
    assert str(seen[0].url).startswith("https://weather.test/v1/forecast?")
    assert params["latitude"] == "47.5"
    assert params["longitude"] == "19.05"
    assert params["daily"] == "temperature_2m_max,temperature_2m_min,weathercode"
    assert params["timezone"] == "auto"
    assert params["start_date"] == "2026-09-20"
    assert params["end_date"] == "2026-09-22"
    assert days[0] == DayWeather(
        day=date(2026, 9, 20),
        summary="clear",
        t_max=27.4,
        t_min=16.2,
        source="open-meteo",
    )
    assert days[1].summary == "light rain"
    # A code we have no phrase for still reads like weather.
    assert days[2].summary == "changeable"


async def test_dates_beyond_the_horizon_ask_nothing():
    handler, seen = _ok()

    days = await _forecast(handler, horizon_days=16).daily(
        47.5, 19.05, date(2026, 11, 1), date(2026, 11, 4)
    )

    assert days == []
    assert seen == []


async def test_the_end_is_clamped_to_the_horizon():
    """A trip that starts inside the horizon gets the days it can."""
    handler, seen = _ok()

    await _forecast(handler, horizon_days=16).daily(
        47.5, 19.05, date(2026, 9, 20), date(2026, 10, 30)
    )

    assert seen[0].url.params["end_date"] == "2026-10-03"


async def test_a_custom_timezone_travels():
    handler, seen = _ok()

    await _forecast(handler, timezone="Europe/Madrid").daily(
        40.4, -3.7, date(2026, 9, 20), date(2026, 9, 20)
    )

    assert seen[0].url.params["timezone"] == "Europe/Madrid"


async def test_an_upstream_error_is_no_weather_not_an_exception(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="upstream detail")

    with caplog.at_level(logging.WARNING):
        days = await _forecast(handler).daily(
            47.5, 19.05, date(2026, 9, 20), date(2026, 9, 21)
        )

    assert days == []
    assert "Open-Meteo answered 500" in caplog.text


async def test_an_unreachable_upstream_is_no_weather(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route to host", request=request)

    with caplog.at_level(logging.WARNING):
        days = await _forecast(handler).daily(
            47.5, 19.05, date(2026, 9, 20), date(2026, 9, 21)
        )

    assert days == []
    assert "Open-Meteo unreachable" in caplog.text


async def test_malformed_json_is_no_weather(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>not json</html>")

    with caplog.at_level(logging.WARNING):
        days = await _forecast(handler).daily(
            47.5, 19.05, date(2026, 9, 20), date(2026, 9, 21)
        )

    assert days == []
    assert "malformed JSON" in caplog.text


async def test_an_answer_without_a_daily_block_is_no_weather(caplog):
    handler, _ = _ok({"error": True, "reason": "Invalid time interval"})

    with caplog.at_level(logging.WARNING):
        days = await _forecast(handler).daily(
            47.5, 19.05, date(2026, 9, 20), date(2026, 9, 21)
        )

    assert days == []
    assert "without a daily block" in caplog.text


async def test_missing_values_leave_the_temperatures_empty():
    handler, _ = _ok(
        {
            "daily": {
                "time": ["2026-09-20"],
                "temperature_2m_max": [None],
                "temperature_2m_min": [],
                "weathercode": [45],
            }
        }
    )

    [day] = await _forecast(handler).daily(
        47.5, 19.05, date(2026, 9, 20), date(2026, 9, 20)
    )

    assert day == DayWeather(
        day=date(2026, 9, 20),
        summary="fog",
        t_max=None,
        t_min=None,
        source="open-meteo",
    )


async def test_the_client_is_reused_and_closed_once():
    handler, seen = _ok()
    forecast = _forecast(handler)

    await forecast.daily(47.5, 19.05, date(2026, 9, 20), date(2026, 9, 20))
    await forecast.daily(47.5, 19.05, date(2026, 9, 21), date(2026, 9, 21))

    assert len(seen) == 2
    await forecast.aclose()
    assert forecast._client.is_closed


def test_from_settings_reads_the_url_and_the_timeout():
    forecast = OpenMeteoForecast.from_settings(
        AISettings(
            OPEN_METEO_URL="https://weather.test/v1/forecast", OPEN_METEO_TIMEOUT=2.5
        )
    )

    assert forecast._base_url == "https://weather.test/v1/forecast"
    assert forecast._client.timeout.read == 2.5
    assert forecast._client.timeout.connect == 2.5
