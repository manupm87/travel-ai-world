# ruff: noqa: RUF001 -- hours text in these cases is typeset with en dashes
"""`application.validate`: pure checks over a placed itinerary."""

from datetime import date

import pytest
from ai_api.application.validate import (
    Placed,
    closed_warnings,
    distance_warnings,
    haversine_km,
    is_closed_on,
    load_warning,
    strip_prices,
    validate_day,
)
from ai_api.schemas.planner_events import OptionCard, Pace, Slot

PARLIAMENT = (47.5071, 19.0458)
GELLERT_BATHS = (47.4838, 19.0523)


def _card(**overrides: object) -> OptionCard:
    defaults: dict[str, object] = {
        "id": "c1",
        "title": "Card",
        "subtitle": None,
        "district": None,
        "category": "see",
        "image_url": None,
        "image_credit": None,
        "price_tier": None,
        "rating_text": None,
        "hours": None,
        "lat": None,
        "lon": None,
        "why": "",
        "source": "Wikivoyage",
        "source_url": "https://example.com",
        "license": "CC BY-SA 4.0",
        "deep_link": None,
    }
    return OptionCard(**{**defaults, **overrides})  # type: ignore[arg-type]


class TestHaversine:
    def test_known_distance(self) -> None:
        distance = haversine_km(*PARLIAMENT, *GELLERT_BATHS)
        assert distance == pytest.approx(2.6, abs=0.1)

    def test_same_point_is_zero(self) -> None:
        assert haversine_km(*PARLIAMENT, *PARLIAMENT) == pytest.approx(0.0, abs=1e-9)


class TestDistanceWarnings:
    def test_warns_across_more_than_max_km_same_day(self) -> None:
        near = _card(id="a", title="Parliament", lat=47.50, lon=19.05)
        far = _card(id="b", title="Far Place", lat=47.55, lon=19.05)
        placed = [
            Placed(Slot(day=1, part="morning"), near),
            Placed(Slot(day=1, part="afternoon"), far),
        ]
        warnings = distance_warnings(placed)
        assert len(warnings) == 1
        warning = warnings[0]
        assert warning.code == "too_far"
        assert warning.slot == Slot(day=1, part="afternoon")
        assert "Parliament → Far Place is 5.6 km" in warning.message

    def test_no_warning_within_max_km(self) -> None:
        a = _card(id="a", title="A", lat=PARLIAMENT[0], lon=PARLIAMENT[1])
        b = _card(id="b", title="B", lat=GELLERT_BATHS[0], lon=GELLERT_BATHS[1])
        placed = [
            Placed(Slot(day=1, part="morning"), a),
            Placed(Slot(day=1, part="afternoon"), b),
        ]
        assert distance_warnings(placed) == []

    def test_no_warning_across_different_days(self) -> None:
        near = _card(id="a", title="A", lat=47.50, lon=19.05)
        far = _card(id="b", title="B", lat=47.55, lon=19.05)
        placed = [
            Placed(Slot(day=1, part="night"), near),
            Placed(Slot(day=2, part="morning"), far),
        ]
        assert distance_warnings(placed) == []

    def test_missing_coordinates_are_skipped(self) -> None:
        with_coords = _card(id="a", title="A", lat=47.50, lon=19.05)
        without_coords = _card(id="b", title="B")
        placed = [
            Placed(Slot(day=1, part="morning"), with_coords),
            Placed(Slot(day=1, part="afternoon"), without_coords),
        ]
        assert distance_warnings(placed) == []

    def test_orders_by_day_then_part_regardless_of_input_order(self) -> None:
        morning = _card(id="m", title="Morning", lat=47.50, lon=19.05)
        afternoon = _card(id="a", title="Afternoon", lat=47.55, lon=19.05)
        evening = _card(id="e", title="Evening", lat=47.50, lon=19.05)
        # Given out of order: evening, morning, afternoon.
        placed = [
            Placed(Slot(day=1, part="evening"), evening),
            Placed(Slot(day=1, part="morning"), morning),
            Placed(Slot(day=1, part="afternoon"), afternoon),
        ]
        warnings = distance_warnings(placed)
        # morning -> afternoon is far (warn on afternoon's slot); afternoon ->
        # evening is far too (warn on evening's slot); morning -> evening
        # never compared directly since they are not consecutive once ordered.
        assert [w.slot for w in warnings] == [
            Slot(day=1, part="afternoon"),
            Slot(day=1, part="evening"),
        ]

    def test_unpinned_slots_are_ordered_last_within_a_day(self) -> None:
        pinned = _card(id="p", title="Pinned", lat=47.50, lon=19.05)
        unpinned = _card(id="u", title="Unpinned", lat=47.50, lon=19.05)
        placed = [
            Placed(Slot(day=1, part=None), unpinned),
            Placed(Slot(day=1, part="morning"), pinned),
        ]
        # Close together, so no warning, but this must not raise.
        assert distance_warnings(placed) == []

    def test_spanish_message(self) -> None:
        near = _card(id="a", title="Parlamento", lat=47.50, lon=19.05)
        far = _card(id="b", title="Lugar Lejano", lat=47.55, lon=19.05)
        placed = [
            Placed(Slot(day=1, part="morning"), near),
            Placed(Slot(day=1, part="afternoon"), far),
        ]
        warnings = distance_warnings(placed, language="es")
        assert len(warnings) == 1
        assert warnings[0].message == (
            "Parlamento → Lugar Lejano están a 5.6 km; prevé transporte"
        )


class TestLoadWarning:
    @pytest.mark.parametrize(
        ("pace", "count"),
        [("relaxed", 1), ("relaxed", 3), ("balanced", 4), ("intense", 6)],
    )
    def test_within_limit_is_fine(self, pace: Pace, count: int) -> None:
        assert load_warning(1, count, pace) is None

    @pytest.mark.parametrize(
        ("pace", "count"), [("relaxed", 4), ("balanced", 5), ("intense", 7)]
    )
    def test_over_limit_warns(self, pace: Pace, count: int) -> None:
        warning = load_warning(2, count, pace)
        assert warning is not None
        assert warning.code == "overloaded_day"
        assert warning.slot == Slot(day=2, part=None)
        assert f"Day 2 has {count} activities for a {pace} pace" == warning.message

    def test_none_pace_behaves_like_balanced(self) -> None:
        assert load_warning(1, 4, None) is None
        warning = load_warning(1, 5, None)
        assert warning is not None
        assert "balanced pace" in warning.message

    def test_spanish_message(self) -> None:
        warning = load_warning(2, 5, "balanced", language="es")
        assert warning is not None
        assert (
            warning.message == "El día 2 tiene 5 actividades para un ritmo equilibrado"
        )


class TestIsClosedOn:
    @pytest.mark.parametrize(
        ("hours", "weekday", "expected"),
        [
            ("closed Mon", 0, True),
            ("closed Mon", 1, False),
            ("closed on Mondays", 0, True),
            ("Mon closed", 0, True),
            ("Mo off", 0, True),
            ("Mo,Tu off", 0, True),
            ("Mo,Tu off", 1, True),
            ("Mo,Tu off", 2, False),
            ("Tu-Su 10:00-18:00", 0, True),
            ("Tu-Su 10:00-18:00", 1, False),
            ("Wed–Sat 12:00–22:00, Sun 12:00–20:00", 0, True),
            ("Wed–Sat 12:00–22:00, Sun 12:00–20:00", 1, True),
            ("Wed–Sat 12:00–22:00, Sun 12:00–20:00", 2, False),
            ("Wed–Sat 12:00–22:00, Sun 12:00–20:00", 5, False),
            ("Mon-Fri 9-19h, Sat 11-18", 6, True),
            ("Mon-Fri 9-19h, Sat 11-18", 0, False),
            ("Mon-Fri 9-19h, Sat 11-18", 5, False),
            (None, 0, False),
            ("", 0, False),
            ("   ", 0, False),
            ("daily", 0, False),
            ("daily", 6, False),
            ("Mo-Su 9-18", 0, False),
            ("Mo-Su 12:00-24:00", 6, False),
            ("every day, 24 hours", 3, False),
            ("24/7", 0, False),
            ("Apr-Oct 9:00-18:00", 0, False),
            (
                "On specific times during the day, and you have to get your "
                "ticket in advance for a timed slot",
                0,
                False,
            ),
            # Regressions: a day list joined by a space ("Sat Sun", "Fri Sat")
            # must be credited as open, same as one joined by "," or "-".
            # Getting this wrong made the "≥5 open days ⇒ the rest is closed"
            # rule declare the space-joined day closed.
            (
                "Cash desk: Mon-Fri 06:00-21:00, Sat Sun 06:00-16:00",
                5,  # Saturday
                False,
            ),
            ("Sun-Thu 11:00-24:00, Fri Sat 11:00-02:00", 4, False),  # Friday
            ("Mon-Fri 20:00-08:00, Sat Sun 24 hr", 5, False),  # Saturday
            ("Mon-Fri 20:00-08:00, Sat Sun 24 hr", 6, False),  # Sunday
            (
                "Mar–Oct: Mon 12:00–21:00, Tue–Thu 11:00–22:00, "
                "Fri Sat 11:00–23:00, Sun 11:00–21:30",
                4,  # Friday
                False,
            ),
        ],
    )
    def test_table(self, hours: str | None, weekday: int, expected: bool) -> None:
        assert is_closed_on(hours, weekday) is expected


class TestClosedWarnings:
    def test_warns_when_the_day_has_a_date_and_hours_say_closed(self) -> None:
        card = _card(id="p", title="Sunday Market", hours="closed Sun")
        placed = [Placed(Slot(day=3, part="morning"), card)]
        warnings = closed_warnings(placed, {3: date(2026, 9, 20)})  # a Sunday
        assert len(warnings) == 1
        assert warnings[0].code == "closed"
        assert warnings[0].slot == Slot(day=3, part="morning")
        assert warnings[0].message == "Sunday Market looks closed on Sunday"

    def test_no_warning_when_the_day_has_no_date(self) -> None:
        card = _card(id="p", title="Sunday Market", hours="closed Sun")
        placed = [Placed(Slot(day=3, part="morning"), card)]
        assert closed_warnings(placed, {}) == []

    def test_no_warning_when_open(self) -> None:
        card = _card(id="p", title="Everyday Place", hours="Mo-Su 09:00-18:00")
        placed = [Placed(Slot(day=1, part="morning"), card)]
        assert closed_warnings(placed, {1: date(2026, 9, 21)}) == []

    def test_spanish_message(self) -> None:
        card = _card(id="p", title="Mercado Dominical", hours="closed Sun")
        placed = [Placed(Slot(day=3, part="morning"), card)]
        warnings = closed_warnings(
            placed,
            {3: date(2026, 9, 20)},
            language="es",  # a Sunday
        )
        assert len(warnings) == 1
        assert warnings[0].message == "Mercado Dominical parece cerrado el domingo"


class TestStripPrices:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("€120", "(price not shown)"),
            ("120 €", "(price not shown)"),
            ("HUF 15,500", "(price not shown)"),
            ("15.500 Ft", "(price not shown)"),
            ("from $89", "from (price not shown)"),
            ("€1,200.50", "(price not shown)"),
            ("Ft2200", "(price not shown)"),
            ("£45", "(price not shown)"),
            (
                "Double €345-555, suites €345-4600",
                "Double (price not shown)-555, suites (price not shown)-4600",
            ),
            ("5000 forints", "(price not shown)"),
            ("50 Forint", "(price not shown)"),
            ("1 forint", "(price not shown)"),
            ("huf 15000", "(price not shown)"),
            ("15000 huf", "(price not shown)"),
            ("eur 50", "(price not shown)"),
            ("50 eur", "(price not shown)"),
            ("usd 20", "(price not shown)"),
            ("20 usd", "(price not shown)"),
            ("gbp 10", "(price not shown)"),
            ("10 gbp", "(price not shown)"),
        ],
    )
    def test_strips_amounts_with_a_currency(self, text: str, expected: str) -> None:
        result, found = strip_prices(text)
        assert result == expected
        assert found is True

    @pytest.mark.parametrize(
        "text",
        [
            "3 days",
            "2 adults",
            "2026-09-18",
            "18:00",
            "691 rooms",
            "20 km",
            "120",
            "Mo-Su 12:00-24:00",
            "Andrássy út 22, 1061 Budapest",
            "5 ft tall",
            "The tower is 96 ft high",
            "for the win",
            "forintxyz nonsense word",
        ],
    )
    def test_never_strips_bare_numbers(self, text: str) -> None:
        result, found = strip_prices(text)
        assert result == text
        assert found is False


class TestValidateDay:
    def test_combines_distance_load_and_closed_in_order(self) -> None:
        far_a = _card(
            id="a", title="A", lat=47.50, lon=19.05, hours="Mo-Su 09:00-18:00"
        )
        far_b = _card(id="b", title="B", lat=47.55, lon=19.05, hours="closed Mon")
        placed = [
            Placed(Slot(day=1, part="morning"), far_a),
            Placed(Slot(day=1, part="afternoon"), far_b),
            Placed(Slot(day=1, part="evening"), _card(id="c", title="C")),
            Placed(Slot(day=1, part="night"), _card(id="d", title="D")),
            Placed(Slot(day=1, part=None), _card(id="e", title="E")),
        ]
        warnings = validate_day(
            1,
            placed,
            pace="relaxed",
            on=date(2026, 9, 21),  # a Monday
        )
        codes = [w.code for w in warnings]
        assert codes == ["too_far", "overloaded_day", "closed"]

    def test_only_considers_the_given_day(self) -> None:
        card = _card(id="a", title="A", lat=47.50, lon=19.05)
        placed = [
            Placed(Slot(day=1, part="morning"), card),
            Placed(Slot(day=2, part="morning"), card),
        ]
        warnings = validate_day(1, placed, pace="relaxed", on=None)
        assert warnings == []

    def test_no_closed_warning_without_a_date(self) -> None:
        card = _card(id="a", title="A", hours="closed Mon")
        placed = [Placed(Slot(day=1, part="morning"), card)]
        warnings = validate_day(1, placed, pace="balanced", on=None)
        assert warnings == []
