"""Which language the planner answers in (TRA-246)."""

import pytest
from ai_api.application.language import detect_language


@pytest.mark.parametrize(
    "message",
    [
        "Voy a Bolonia 3 noches",
        "Quiero ir a Roma",
        "Me gustaría ir a Budapest con mi pareja",
        "Budapest",
        "Relajado",
        "Cultura, gastronomía",
        "2 adults",
    ],
)
def test_a_spanish_page_keeps_spanish_unless_the_traveller_clearly_writes_english(
    message: str,
):
    assert detect_language([message], "es") == "es"


@pytest.mark.parametrize(
    "message",
    ["Voy a Bolonia 3 noches", "Quiero ir a Roma con mi pareja", "¿Hay algo cerca?"],
)
def test_spanish_on_an_english_page_is_answered_in_spanish(message: str):
    assert detect_language([message], "en") == "es"


def test_english_on_a_spanish_page_is_answered_in_english():
    assert detect_language(["I want to go to Rome with my wife"], "es") == "en"


def test_a_tie_or_nothing_to_read_keeps_the_page():
    assert detect_language([], "es") == "es"
    assert detect_language(["Budapest"], "en") == "en"
    # One word either way is not enough to switch.
    assert detect_language(["hotel cerca"], "en") == "en"
