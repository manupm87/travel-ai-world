"""The planner's wire contract (TRA-142): every event round-trips JSON, the
discriminators reject what they do not know, and the OpenAPI document carries
the models no route declares."""

import json
from datetime import date

import pytest
from ai_api.main import app
from ai_api.openapi import stream_components
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import (
    BRIEF_FIELDS,
    DoneEvent,
    ErrorEvent,
    OptionCard,
    PlannerEvent,
    Slot,
    TripBrief,
    brief_event,
    done,
    error_event,
    options,
    patch,
    put_activity,
    remove_activity,
    set_day_title,
    set_route,
    set_stay,
    set_weather,
    text,
    warn,
)
from pydantic import BaseModel, TypeAdapter, ValidationError

EVENTS = TypeAdapter(PlannerEvent)


def card(id: str = "wv:en:Budapest/Belváros#see:parliament") -> OptionCard:
    return OptionCard(
        id=id,
        title="Hungarian Parliament",
        subtitle="Kossuth Lajos tér 1-3",
        district="Belváros",
        category="see",
        image_url="https://commons.wikimedia.org/wiki/Special:FilePath/P.jpg?width=800",
        image_credit="Someone (CC BY-SA 4.0) · Wikimedia Commons",
        price_tier=2,
        rating_text=None,
        hours="Daily 08:00-18:00",
        lat=47.5071,
        lon=19.0458,
        why="The building the city is known for.",
        source="Wikivoyage",
        source_url="https://en.wikivoyage.org/wiki/Budapest/Belváros",
        license="CC BY-SA 4.0",
        deep_link=None,
    )


def full_brief() -> TripBrief:
    return TripBrief(
        destination="Budapest",
        origin="Madrid",
        start_date=date(2026, 10, 20),
        end_date=date(2026, 10, 24),
        nights=4,
        adults=2,
        children=0,
        budget_tier=2,
        interests=["food", "thermal_baths"],
        pace="balanced",
    )


SLOT = Slot(day=2, part="afternoon")

EVERY_EVENT: list[BaseModel] = [
    text("Hola"),
    brief_event(TripBrief.empty()),
    brief_event(full_brief()),
    options("g-hotels", "hotel", "Pick a hotel", [card()], selection="single"),
    options("g-alt-2-afternoon", "experience", "Alternatives", [card()], slot=SLOT),
    patch(
        set_stay(card()),
        put_activity(SLOT, card()),
        remove_activity(SLOT, "wv:x"),
        set_day_title(1, "Castle Hill"),
        set_route(
            "Madrid",
            "Budapest",
            outbound_date=date(2026, 10, 20),
            return_date=date(2026, 10, 24),
            deep_link="https://www.google.com/travel/flights?q=Flights%20from%20MAD",
        ),
        set_weather(1, "Mild and dry", t_max=17.0, t_min=8.0, source="open-meteo"),
        warn("too_far", "Rudas is 4.2 km from the castle", slot=SLOT),
        warn("unverified_price", "Prices are not verified"),
    ),
    error_event("Session expired", "UNAUTHORIZED"),
    done(),
]


@pytest.mark.parametrize("event", EVERY_EVENT, ids=lambda e: type(e).__name__)
def test_every_event_round_trips_json(event: BaseModel):
    line = event.model_dump_json()

    parsed = EVENTS.validate_json(line)

    assert parsed == event
    assert type(parsed) is type(event)


def test_every_wire_field_is_written_even_when_null():
    """The frontend types are generated from this: nothing may go missing."""
    payload = json.loads(brief_event(TripBrief.empty()).model_dump_json())

    assert payload == {
        "type": "brief",
        "brief": {
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
        },
        "missing": list(BRIEF_FIELDS),
    }


def test_dates_travel_as_iso_strings():
    payload = json.loads(brief_event(full_brief()).model_dump_json())

    assert payload["brief"]["start_date"] == "2026-10-20"
    assert payload["missing"] == []


def test_ops_are_flat_and_discriminated_on_op():
    payload = json.loads(patch(set_day_title(3, "Baths")).model_dump_json())

    assert payload["ops"] == [{"op": "set_day_title", "day": 3, "title": "Baths"}]


@pytest.mark.parametrize(
    "line",
    [
        pytest.param('{"type": "surprise", "delta": "x"}', id="unknown-type"),
        pytest.param('{"delta": "x"}', id="no-type"),
        pytest.param('{"type": "text"}', id="missing-field"),
        pytest.param(
            '{"type": "itinerary_patch", "ops": [{"op": "teleport"}]}', id="unknown-op"
        ),
        pytest.param(
            '{"type": "itinerary_patch", "ops": [{"op": "warn", "slot": null, '
            '"code": "meh", "message": "x"}]}',
            id="unknown-warn-code",
        ),
    ],
)
def test_discriminators_reject_what_they_do_not_know(line: str):
    with pytest.raises(ValidationError):
        EVENTS.validate_json(line)


def test_why_is_kept_short():
    with pytest.raises(ValidationError):
        card().model_copy(update={"why": "x" * 141}).model_validate(
            card().model_dump() | {"why": "x" * 141}
        )


def test_missing_follows_the_checklist_order():
    brief = full_brief().model_copy(update={"origin": None, "interests": []})

    assert brief.missing() == ["origin", "interests"]


def test_planner_turn_accepts_a_selection_without_a_message():
    turn = PlannerTurn.model_validate(
        {
            "message": None,
            "action": {"type": "select", "group_id": "g-hotels", "card_ids": ["a"]},
            "history": [{"role": "user", "content": "Budapest in October"}],
            "brief": json.loads(full_brief().model_dump_json()),
            "itinerary": {
                "stay_card_id": None,
                "days": [
                    {
                        "day": 1,
                        "slots": {
                            "morning": ["a"],
                            "afternoon": [],
                            "evening": [],
                            "night": [],
                        },
                    }
                ],
            },
            "trip_id": None,
        }
    )

    assert turn.action is not None and turn.action.type == "select"
    assert turn.brief is not None and turn.brief.start_date == date(2026, 10, 20)
    assert turn.itinerary is not None and turn.itinerary.days[0].slots.morning == ["a"]


def test_planner_turn_rejects_an_unknown_action():
    with pytest.raises(ValidationError):
        PlannerTurn.model_validate(
            {
                "message": None,
                "action": {"type": "shuffle"},
                "history": [],
                "brief": None,
                "itinerary": None,
                "trip_id": None,
            }
        )


def test_openapi_document_carries_the_stream_models():
    """No route declares them (the body is a stream): `ai_api.openapi` adds them."""
    schemas = app.openapi()["components"]["schemas"]

    for name in (
        "PlannerEvent",
        "ItineraryOp",
        "PlannerTurn",
        "OptionCard",
        "TripBrief",
    ):
        assert name in schemas, name
    assert schemas["PlannerEvent"]["discriminator"]["propertyName"] == "type"
    assert set(schemas["PlannerEvent"]["discriminator"]["mapping"]) == {
        "text",
        "brief",
        "options",
        "itinerary_patch",
        "error",
        "done",
    }
    assert schemas["ItineraryOp"]["discriminator"]["propertyName"] == "op"
    # Every wire field is required, so the generated TypeScript has no `?`.
    assert set(schemas["TripBrief"]["required"]) == set(TripBrief.model_fields)
    assert set(schemas["OptionCard"]["required"]) == set(OptionCard.model_fields)
    assert set(schemas["ErrorEvent"]["required"]) == set(ErrorEvent.model_fields)
    assert set(schemas["DoneEvent"]["required"]) == set(DoneEvent.model_fields)


def test_stream_components_reference_each_other_under_components():
    rendered = json.dumps(stream_components())

    assert "#/$defs/" not in rendered
    assert "#/components/schemas/OptionCard" in rendered
