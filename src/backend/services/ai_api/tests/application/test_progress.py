"""PackingProgress: the planner's phases as the page's progress (TRA-242)."""

from datetime import date

from ai_api.application.progress import PackingProgress
from ai_api.schemas.planner_events import (
    OptionCard,
    Slot,
    TripBrief,
    brief_event,
    patch,
    put_activity,
    set_weather,
    text,
)

EMPTY = TripBrief.model_validate(
    {
        "destination": None,
        "origin": None,
        "start_date": None,
        "end_date": None,
        "nights": None,
        "adults": None,
        "children": None,
        "budget_tier": None,
        "interests": [],
        "pace": None,
    }
)


def card(source: str) -> OptionCard:
    return OptionCard.model_validate(
        {
            "id": f"x:{source}",
            "title": "Parliament",
            "subtitle": None,
            "category": "see",
            "district": None,
            "lat": None,
            "lon": None,
            "why": "",
            "price_tier": None,
            "hours": None,
            "rating_text": None,
            "image_url": None,
            "image_credit": None,
            "source": source,
            "source_url": "https://example.com",
            "license": "CC BY-SA",
            "deep_link": None,
        }
    )


def packing(language: str = "en") -> PackingProgress:
    return PackingProgress(language, EMPTY, lambda brief: brief.destination)  # type: ignore[arg-type]


def test_steps_only_move_forward():
    p = packing()
    assert p.phase("open") is not None
    assert p.phase("fold") is not None
    assert p.phase("wardrobe") is None
    assert p.phase("fold") is None
    assert p.step == "fold"


def test_the_brief_is_the_list_and_names_the_city_from_then_on():
    p = packing("es")
    p.phase("open")
    out = p.around(brief_event(EMPTY.model_copy(update={"destination": "Budapest"})))
    assert [e.type for e in out] == ["progress", "brief"]
    assert out[0].step == "list"  # type: ignore[union-attr]
    wardrobe = p.phase("wardrobe")
    assert (
        wardrobe is not None
        and wardrobe.detail == "Saco lo que hay de Budapest en las guías."
    )


def test_new_sources_are_told_once_as_they_turn_up():
    p = packing()
    p.phase("fold", days=3)
    slot = Slot(day=1, part="morning")
    first = p.around(patch(put_activity(slot, card("Wikivoyage"))))
    assert first[-1].type == "progress" and first[-1].sources == ["Wikivoyage"]  # type: ignore[union-attr]
    again = p.around(patch(put_activity(slot, card("Wikivoyage"))))
    assert [e.type for e in again] == ["itinerary_patch"]
    weather = p.around(
        patch(set_weather(1, "Sunny", t_max=18.0, t_min=9.0, source="Open-Meteo"))
    )
    assert weather[-1].sources == ["Wikivoyage", "Open-Meteo"]  # type: ignore[union-attr]
    assert (
        weather[-1].detail == "Sharing the stops out over 3 days, close to each other."
    )  # type: ignore[union-attr]


def test_text_passes_through_untouched():
    p = packing()
    p.phase("zip")
    assert p.around(text("Done.")) == [text("Done.")]


def test_a_date_brief_does_not_matter_to_the_sentence_without_a_city():
    p = PackingProgress(
        "en", EMPTY.model_copy(update={"start_date": date(2026, 10, 1)}), lambda _: None
    )
    event = p.phase("wardrobe")
    assert event is not None and event.detail == "Looking through the guides."
