"""`PlanTrip` (TRA-143) over a real corpus sample, with a scripted model.

The retriever is the filter-aware fake over `tests/fixtures/budapest_sample.jsonl`
(40 Budapest documents as the store returns them) and the model answers from
a script, so each test pins one turn of the state machine: what was
retrieved, what the model was shown, and which events came out.
"""

import json
from collections.abc import AsyncIterator, Sequence
from datetime import date
from pathlib import Path

import pytest
from ai_api.application.plan_trip import (
    PlanTrip,
    _alternatives_slot,
    city_key,
    resolve_city,
)
from ai_api.domain.models import City, DayWeather, Document, Photo
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import (
    BriefEvent,
    ItineraryPatchEvent,
    OptionsEvent,
    PlannerEvent,
    TextEvent,
    TripBrief,
)
from ai_api.testing import (
    BUDAPEST,
    FakePhotoFinder,
    FakeProvider,
    FakeRetriever,
    city_for,
    documents_from_corpus,
)

BOLOGNA = city_for("bologna", "bolonia", name="Bologna")
SIGHTS = ("see", "do", "tour", "history")

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"
CORPUS = documents_from_corpus(FIXTURE)
BY_ID = {d.id: d for d in CORPUS}

BELVAROS = "wv:en:Budapest/Belváros#section:intro:c1"
ASTORIA = "wv:en:Budapest/Belváros#sleep:danubius-hotel-astoria"
ACE_HOSTEL = "wv:en:Budapest/Belváros#sleep:ace-hostel"
MARCO_POLO = "wv:en:Budapest/Erzsébetváros#sleep:marco-polo-hostel"
IBIS = "wv:en:Budapest/Erzsébetváros#sleep:ibis-budapest-city"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
BASILICA = "wv:en:Budapest/Belváros#see:st-stephen-istvan-basilica"
BASTION = "wv:en:Budapest/Budavár#see:fisherman-s-bastion"
RUDAS = "wv:en:Budapest/Víziváros#do:rudas-thermal-bath"
GELLERT = "wv:en:Budapest/South Buda#do:gellert-baths"
ANNA_CAFE = "wv:en:Budapest/Belváros#eat:anna-cafe"
SZIMPLA = "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi"

TODAY = date(2026, 9, 18)


def brief(**overrides: object) -> TripBrief:
    values = {
        "destination": "Budapest",
        "origin": "Madrid",
        "start_date": date(2026, 10, 20),
        "end_date": date(2026, 10, 24),
        "nights": 4,
        "adults": 2,
        "children": 0,
        "budget_tier": 2,
        "interests": ["food", "thermal_baths", "history"],
        "pace": "balanced",
    }
    values.update(overrides)
    return TripBrief.model_validate(values)


def turn(
    message: str | None = None,
    *,
    action: dict[str, object] | None = None,
    brief: TripBrief | None = None,
    stay: str | None = None,
    days: list[dict[str, list[str]]] | None = None,
    history: Sequence[tuple[str, str]] = (),
    exclude: Sequence[str] = (),
) -> PlannerTurn:
    itinerary = None
    if stay is not None or days is not None:
        itinerary = {
            "stay_card_id": stay,
            "days": [
                {
                    "day": index + 1,
                    "slots": {
                        "morning": [],
                        "afternoon": [],
                        "evening": [],
                        "night": [],
                    }
                    | slots,
                }
                for index, slots in enumerate(days or [])
            ],
        }
    return PlannerTurn.model_validate(
        {
            "message": message,
            "action": action,
            "history": [{"role": r, "content": c} for r, c in history],
            "brief": brief.model_dump() if brief else None,
            "itinerary": itinerary,
            "exclude_card_ids": list(exclude),
            "trip_id": None,
        }
    )


class FakeWeather:
    def __init__(self, days: Sequence[DayWeather] = ()) -> None:
        self.days = list(days)
        self.calls: list[tuple[float, float, date, date]] = []

    async def daily(
        self, lat: float, lon: float, start: date, end: date
    ) -> list[DayWeather]:
        self.calls.append((lat, lon, start, end))
        return [w for w in self.days if start <= w.day <= end]


def planner(
    replies: Sequence[str] = (),
    *,
    deltas: Sequence[str] = ("Which ", "dates?"),
    documents: Sequence[Document] = CORPUS,
    weather: FakeWeather | None = None,
    photos: FakePhotoFinder | None = None,
    cities: Sequence[City] = (BUDAPEST,),
) -> tuple[PlanTrip, FakeProvider, FakeRetriever]:
    provider = FakeProvider(deltas=deltas, replies=replies)
    retriever = FakeRetriever(documents)
    use_case = PlanTrip(
        provider,
        retriever,
        weather=weather,
        photos=photos,
        cities=cities,
        max_days=7,
        candidates=8,
        today=lambda: TODAY,
    )
    return use_case, provider, retriever


async def run(events: AsyncIterator[PlannerEvent]) -> list[PlannerEvent]:
    return [event async for event in events]


def picks(*ids: str, why: str = "Fits the brief.") -> str:
    return json.dumps({"picks": [{"id": i, "why": why} for i in ids]})


def only(events: Sequence[PlannerEvent], kind: type) -> list:
    return [e for e in events if isinstance(e, kind)]


def ops_of(events: Sequence[PlannerEvent], op: str) -> list:
    return [o for e in only(events, ItineraryPatchEvent) for o in e.ops if o.op == op]


def joined_text(events: Sequence[PlannerEvent]) -> str:
    return "".join(e.delta for e in only(events, TextEvent))


# ─── The brief ───────────────────────────────────────────────────────────────


async def test_incomplete_brief_is_extracted_then_one_question_is_streamed():
    use_case, provider, _ = planner(
        [
            json.dumps(
                {
                    "destination": "Budapest",
                    "origin": "Madrid",
                    "adults": 2,
                    "budget_tier": 2,
                    "interests": ["food", "thermal_baths"],
                }
            )
        ]
    )

    events = await run(
        use_case(turn("5 days in Budapest from Madrid, 2 adults, mid budget"))
    )

    [brief_event] = only(events, BriefEvent)
    assert brief_event.brief.destination == "Budapest"
    assert brief_event.brief.interests == ["food", "thermal_baths"]
    assert brief_event.missing == ["dates"]
    assert joined_text(events) == "Which dates?"
    assert not only(events, OptionsEvent)
    # The extraction saw today's date and the current (empty) brief.
    shown = "\n".join(m.content for m in provider.completions[0])
    assert TODAY.isoformat() in shown and '"destination":null' in shown
    # The question prompt named the missing field.
    assert any("dates" in m.content for m in provider.calls[0])


async def test_brief_merges_into_what_the_client_sent_and_derives_nights():
    partial = brief(start_date=None, end_date=None, nights=None, interests=["food"])
    use_case, _, _ = planner(
        [
            json.dumps(
                {
                    "start_date": "2026-10-20",
                    "end_date": "2026-10-24",
                    "interests": ["history"],
                }
            ),
            picks(BELVAROS),
        ]
    )

    events = await run(use_case(turn("Dates: 2026-10-20 · 2026-10-24", brief=partial)))

    [brief_event] = only(events, BriefEvent)
    assert brief_event.missing == []
    assert brief_event.brief.nights == 4
    assert brief_event.brief.interests == ["food", "history"]
    assert brief_event.brief.origin == "Madrid"  # kept from the client


async def test_a_city_the_corpus_does_not_cover_is_declined_not_invented():
    use_case, _, retriever = planner([json.dumps({"destination": "Paris"})])

    events = await run(use_case(turn("A weekend in Paris")))

    [brief_event] = only(events, BriefEvent)
    assert brief_event.brief.destination is None
    assert "destination" in brief_event.missing
    assert "Paris" in joined_text(events) and "Budapest" in joined_text(events)
    assert retriever.searches == []


def test_city_key_normalises_what_the_model_writes():
    assert city_key("Budapest, Hungary") == "budapest"
    assert city_key(" BUDAPEST ") == "budapest"
    assert city_key(None) is None


def test_a_destination_resolves_through_any_of_the_citys_spellings():
    cities = (BUDAPEST, BOLOGNA)

    assert resolve_city("Bolonia", cities) is BOLOGNA
    assert resolve_city("bologna, Italy", cities) is BOLOGNA
    assert resolve_city("Un viaje a BOLONIA", cities) is BOLOGNA
    assert resolve_city("Budapest, Hungary", cities) is BUDAPEST
    # A whole word, not a substring; and nothing for an uncovered city.
    assert resolve_city("Bolognese village", cities) is None
    assert resolve_city("Paris", cities) is None
    assert resolve_city(None, cities) is None


async def test_the_not_covered_text_names_every_covered_city_in_the_users_language():
    use_case, _, _ = planner(
        [json.dumps({"destination": "París"})], cities=(BUDAPEST, BOLOGNA)
    )

    events = await run(use_case(turn("Un fin de semana en París")))

    assert "Budapest y Bologna" in joined_text(events)


async def test_an_alias_lands_on_the_citys_corpus():
    """A Spanish speaker writes "Bolonia": the search filters by `bologna`."""
    documents = [
        Document(
            id=d.id,
            content=d.content,
            metadata={**d.metadata, "city": "bologna"},
        )
        for d in CORPUS
    ]
    use_case, provider, retriever = planner(
        [json.dumps({}), picks()], documents=documents, cities=(BUDAPEST, BOLOGNA)
    )

    await run(use_case(turn("Vale", brief=brief(destination="Bolonia"))))

    _, _, filters = retriever.searches[0]
    assert filters is not None and filters.city == "bologna"
    # The model is told which spellings mean which city.
    shown = provider.completions[0][1].content
    assert "Bologna (bologna, bolonia)" in shown


# ─── Neighbourhoods and hotels ───────────────────────────────────────────────


async def test_complete_brief_without_a_stay_offers_neighbourhoods():
    use_case, provider, retriever = planner(
        [json.dumps({}), picks(BELVAROS, "wv:en:Budapest/Budavár#section:intro:c1")]
    )

    events = await run(use_case(turn("Looks good", brief=brief())))

    [group] = only(events, OptionsEvent)
    assert group.group_id == "nb" and group.kind == "neighbourhood"
    assert group.selection == "single" and group.slot is None
    assert [c.title for c in group.cards][:2] == ["Belváros", "Budavár"]
    assert all(c.why == "Fits the brief." for c in group.cards[:2])
    # Three cards even though the model named two: filled from the candidates.
    assert len(group.cards) == 3
    _, _, filters = retriever.searches[0]
    assert filters is not None and filters.categories == ("neighbourhood",)
    assert filters.city == "budapest"
    # The model was shown ids and summaries, never asked to write a place.
    prompt = provider.completions[1][-2].content
    assert BELVAROS in prompt and "Use only ids from the list" in prompt


async def test_selecting_a_neighbourhood_lists_hotels_there_within_budget():
    use_case, _, retriever = planner([picks(ASTORIA)])

    events = await run(
        use_case(
            turn(
                action={"type": "select", "group_id": "nb", "card_ids": [BELVAROS]},
                brief=brief(budget_tier=2),
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert group.group_id == "hotels:Belváros" and group.kind == "hotel"
    assert group.cards[0].id == ASTORIA and group.cards[0].price_tier == 2
    assert all(c.district == "Belváros" for c in group.cards)
    assert all(c.category == "sleep" for c in group.cards)
    assert retriever.fetches[0] == [BELVAROS]
    first = retriever.searches[0][2]
    assert first is not None
    assert first.categories == ("sleep",) and first.districts == ("Belváros",)
    assert first.price_tier_max == 2
    # Two hotels at ≤ €€ in the sample: the tier was relaxed to reach three.
    assert retriever.searches[1][2] is not None
    assert retriever.searches[1][2].price_tier_max is None


async def test_a_stale_group_id_is_answered_with_fresh_advice_not_an_error():
    use_case, _, _ = planner()

    events = await run(
        use_case(
            turn(
                action={"type": "select", "group_id": "nb", "card_ids": ["nope"]},
                brief=brief(),
            )
        )
    )

    assert only(events, TextEvent) and not only(events, OptionsEvent)


# ─── The draft ───────────────────────────────────────────────────────────────


def skeleton(days: int) -> str:
    return json.dumps(
        {
            "days": [
                {
                    "day": d,
                    "title": f"Day {d} title",
                    "districts": ["Belváros"] if d % 2 else ["Budavár", "Nowhere"],
                    "theme": "history and baths",
                }
                for d in range(1, days + 1)
            ]
        }
    )


def day_picks(**parts: list[dict[str, str]]) -> str:
    return json.dumps(parts)


async def test_selecting_a_hotel_sets_the_stay_and_drafts_every_day():
    forecast = FakeWeather(
        [DayWeather(date(2026, 10, 20), "Sunny", 18.0, 9.0, "open-meteo")]
    )
    use_case, provider, retriever = planner(
        [
            skeleton(5),
            day_picks(
                morning=[{"id": PARLIAMENT, "why": "Start with the landmark."}],
                afternoon=[{"id": BASTION, "why": "Across the river, €22 well spent."}],
                evening=[{"id": ANNA_CAFE, "why": "Close to the stay."}],
                night=[{"id": SZIMPLA, "why": "The ruin bar."}],
            ),
        ],
        weather=forecast,
    )

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:Belváros",
                    "card_ids": [ASTORIA],
                },
                brief=brief(),
            )
        )
    )

    # The stay first, then the route, then one patch per day, then a closing text.
    [stay] = ops_of(events, "set_stay")
    assert stay.card.id == ASTORIA and stay.card.title == "Danubius Hotel Astoria"
    [route] = ops_of(events, "set_route")
    assert route.origin == "Madrid" and route.destination == "Budapest"
    assert route.deep_link is not None and "MAD" in route.deep_link
    assert route.outbound_date == date(2026, 10, 20)

    titles = ops_of(events, "set_day_title")
    assert [t.day for t in titles] == [1, 2, 3, 4, 5]
    assert titles[0].title == "Day 1 title"

    activities = ops_of(events, "put_activity")
    for day in range(1, 6):
        parts = {a.slot.part for a in activities if a.slot.day == day}
        # The sample holds three bars: nights run out after day 3, the rest never.
        expected = {"morning", "afternoon", "evening"} | (
            {"night"} if day <= 3 else set()
        )
        assert parts == expected, day
    # Day 1 is what the model picked, with its reasons and no price.
    day1 = {a.slot.part: a.card for a in activities if a.slot.day == 1}
    assert day1["morning"].id == PARLIAMENT
    assert day1["morning"].why == "Start with the landmark."
    # Picked outside the day's district: candidates also come from the whole city.
    assert day1["afternoon"].id == BASTION and "€" not in day1["afternoon"].why
    assert day1["afternoon"].district == "Budavár"
    assert day1["afternoon"].image_url is not None
    # Every activity is a retrieved corpus document, once.
    ids = [a.card.id for a in activities]
    assert all(i in BY_ID for i in ids) and len(ids) == len(set(ids))
    assert ASTORIA not in ids
    # Balanced pace: at most four per day, no overload warning.
    assert all(sum(1 for a in activities if a.slot.day == d) <= 4 for d in range(1, 6))
    assert not [w for w in ops_of(events, "warn") if w.code == "overloaded_day"]
    # The price in the model's text became a warning on that day.
    prices = [w for w in ops_of(events, "warn") if w.code == "unverified_price"]
    assert prices and prices[0].slot is not None and prices[0].slot.day == 1

    weather = {w.day: w for w in ops_of(events, "set_weather")}
    assert weather[1].summary == "Sunny" and weather[1].source == "open-meteo"
    assert weather[2].source == "climate normals" and weather[2].t_max == 16.0
    assert "October" in weather[2].summary
    assert forecast.calls[0][2:] == (date(2026, 10, 20), date(2026, 10, 24))

    assert "5-day" in joined_text(events)
    # The skeleton saw the district list and the stay; day 1 picks saw the weekday.
    assert "Belváros" in provider.completions[0][-2].content
    assert "Tuesday" in provider.completions[1][-2].content
    # A district the model invented was dropped before searching.
    districts = [f.districts for _, _, f in retriever.searches if f is not None]
    assert all("Nowhere" not in d for d in districts)


async def test_a_pick_the_retriever_never_returned_is_dropped_and_the_day_stays_full():
    use_case, _, _ = planner(
        [
            skeleton(1),
            day_picks(
                morning=[{"id": "wv:en:Budapest/Belváros#see:made-up", "why": "x"}],
                afternoon=[{"id": ASTORIA, "why": "the hotel is not a sight"}],
                evening=[{"id": ANNA_CAFE, "why": "ok"}],
                night=[{"id": SZIMPLA, "why": "ok"}],
            ),
        ]
    )

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
            )
        )
    )

    activities = {a.slot.part: a.card for a in ops_of(events, "put_activity")}
    assert set(activities) == {"morning", "afternoon", "evening", "night"}
    assert "made-up" not in activities["morning"].id
    assert activities["afternoon"].id != ASTORIA
    assert activities["afternoon"].category in {"see", "do", "tour", "history"}


async def test_a_model_that_never_answers_json_still_yields_a_complete_draft():
    use_case, _, _ = planner(deltas=("not json",))

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(
                    pace="relaxed",
                    start_date=date(2026, 10, 20),
                    end_date=date(2026, 10, 21),
                ),
            )
        )
    )

    titles = ops_of(events, "set_day_title")
    assert [t.title for t in titles] == ["Day 1", "Day 2"]
    activities = ops_of(events, "put_activity")
    assert {(a.slot.day, a.slot.part) for a in activities} == {
        (1, "morning"),
        (1, "afternoon"),
        (1, "evening"),
        (2, "morning"),
        (2, "afternoon"),
        (2, "evening"),
    }
    assert all(a.card.why == "" for a in activities)


async def test_generate_in_the_message_chooses_the_stay_itself():
    use_case, _, _ = planner([json.dumps({}), picks(BELVAROS), skeleton(1)])

    events = await run(
        use_case(
            turn(
                "Just generate the trip",
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
            )
        )
    )

    [stay] = ops_of(events, "set_stay")
    assert stay.card.category == "sleep" and stay.card.district == "Belváros"
    assert ops_of(events, "put_activity")
    assert not only(events, OptionsEvent)


async def test_changing_the_hotel_after_the_draft_keeps_the_days():
    use_case, _, _ = planner()

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:Belváros",
                    "card_ids": [ASTORIA],
                },
                brief=brief(),
                stay="wv:en:Budapest/Belváros#sleep:ace-hostel",
                days=[{"morning": [PARLIAMENT]}],
            )
        )
    )

    assert ops_of(events, "set_stay") and not ops_of(events, "set_day_title")
    assert "Astoria" in joined_text(events)


# ─── After the draft ─────────────────────────────────────────────────────────


async def test_the_pages_own_change_request_lists_three_new_alternatives():
    use_case, provider, _ = planner([picks(BASILICA, GELLERT)])

    events = await run(
        use_case(
            turn(
                "Alternatives for day 2 · afternoon",
                brief=brief(),
                stay=ASTORIA,
                days=[{"morning": [PARLIAMENT]}, {"afternoon": [RUDAS]}],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert group.group_id == "slot:2:afternoon" and group.kind == "experience"
    assert group.slot is not None and (group.slot.day, group.slot.part) == (
        2,
        "afternoon",
    )
    ids = [c.id for c in group.cards]
    assert ids[:2] == [BASILICA, GELLERT] and len(ids) == 3
    assert RUDAS not in ids and PARLIAMENT not in ids  # already in the trip
    assert "day 2" in joined_text(events)
    # No intent call: the page's wording is recognised directly.
    assert len(provider.completions) == 1


async def test_spanish_change_request_answers_in_spanish():
    use_case, _, _ = planner([picks(BASILICA)])

    events = await run(
        use_case(
            turn(
                "Alternativas para el día 1 · noche",
                brief=brief(),
                stay=ASTORIA,
                days=[{"night": [SZIMPLA]}],
                history=[("user", "Quiero un viaje a Budapest desde Madrid")],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert group.group_id == "slot:1:night"
    assert all(c.category == "drink" for c in group.cards)
    assert "Alternativas" in joined_text(events)


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Alternatives for day 2 · afternoon", ((2, "afternoon"), None)),
        ("Alternativas para el día 1 · noche", ((1, "night"), None)),
        (
            "Alternatives for day 2 · afternoon: a thermal bath",
            ((2, "afternoon"), "a thermal bath"),
        ),
        (
            "Alternativas para el día 3 · tarde:   un baño termal  ",
            ((3, "afternoon"), "un baño termal"),
        ),
        ("Alternatives for day 4 · night:   ", ((4, "night"), None)),
        ("Alternatives for day 2 · siesta: something quiet", (None, None)),
        ("What else could we do on day 2?", (None, None)),
    ],
)
def test_the_ask_carries_the_slot_and_the_guidance_when_there_is_one(
    message: str, expected: tuple[tuple[int, str] | None, str | None]
):
    slot, guidance = _alternatives_slot(message)
    found = None if slot is None else (slot.day, slot.part)

    assert (found, guidance) == expected


async def test_a_guided_change_request_searches_for_what_was_asked_for():
    use_case, provider, retriever = planner([picks(GELLERT, RUDAS)])

    events = await run(
        use_case(
            turn(
                "Alternatives for day 2 · afternoon: a thermal bath",
                brief=brief(),
                stay=ASTORIA,
                days=[{"morning": [PARLIAMENT]}, {"afternoon": [BASILICA]}],
            )
        )
    )

    # The guidance replaces the interests-based default as the retrieval query.
    assert {query for query, _, _ in retriever.searches} == {"a thermal bath"}
    [group] = only(events, OptionsEvent)
    assert group.group_id == "slot:2:afternoon"
    assert [c.id for c in group.cards][:2] == [GELLERT, RUDAS]
    # Still the page's own wording: no intent call.
    assert len(provider.completions) == 1


async def test_more_options_never_offers_a_card_the_ask_already_showed():
    use_case, _, _ = planner([picks(BASTION, RUDAS, GELLERT)])

    events = await run(
        use_case(
            turn(
                "Alternatives for day 2 · afternoon",
                brief=brief(),
                stay=ASTORIA,
                days=[{"afternoon": [PARLIAMENT]}],
                exclude=[BASILICA, BASTION],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    ids = [c.id for c in group.cards]
    assert BASILICA not in ids and BASTION not in ids  # already offered
    assert PARLIAMENT not in ids  # already in the trip
    assert ids and len(ids) == len(set(ids))


async def test_other_stays_skip_the_hotels_the_ask_already_showed():
    use_case, _, _ = planner(
        [json.dumps({"intent": "change_stay", "cheaper": False}), picks(IBIS)]
    )

    events = await run(
        use_case(
            turn(
                "Other hotels, please",
                brief=brief(),
                stay=ASTORIA,
                days=[{"morning": [PARLIAMENT]}],
                exclude=[ACE_HOSTEL, MARCO_POLO],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    ids = [c.id for c in group.cards]
    assert group.kind == "hotel" and IBIS in ids
    assert ACE_HOSTEL not in ids and MARCO_POLO not in ids  # already offered
    assert ASTORIA not in ids  # the stay itself


async def test_free_text_after_the_draft_goes_through_the_intent_classifier():
    use_case, _, retriever = planner(
        [
            json.dumps(
                {
                    "intent": "find_options",
                    "kind": "restaurant",
                    "day": 2,
                    "part": None,
                    "query": "Hungarian restaurant",
                }
            ),
            picks(ANNA_CAFE),
        ]
    )

    events = await run(
        use_case(
            turn(
                "restaurantes húngaros cerca del día 2",
                brief=brief(),
                stay=ASTORIA,
                days=[{}, {}],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert group.kind == "restaurant" and group.group_id == "slot:2:evening"
    assert all(c.category == "eat" for c in group.cards)
    assert retriever.searches[0][0] == "Hungarian restaurant"
    filters = retriever.searches[0][2]
    assert filters is not None and filters.price_tier_max == 2


async def test_cheaper_stay_lists_hotels_a_tier_down_near_the_current_one():
    use_case, _, retriever = planner(
        [json.dumps({"intent": "change_stay", "cheaper": True}), picks()]
    )

    events = await run(
        use_case(
            turn(
                "something cheaper", brief=brief(budget_tier=2), stay=ASTORIA, days=[{}]
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert group.kind == "hotel" and ASTORIA not in [c.id for c in group.cards]
    first = retriever.searches[0][2]
    assert first is not None and first.price_tier_max == 1
    assert first.districts == ("Belváros",)


async def test_a_question_is_answered_as_grounded_chat():
    use_case, provider, retriever = planner(
        [json.dumps({"intent": "chat"})], deltas=("The Rudas ", "bath is medieval.")
    )

    events = await run(
        use_case(turn("Is Rudas old?", brief=brief(), stay=ASTORIA, days=[{}]))
    )

    assert joined_text(events) == "The Rudas bath is medieval."
    assert not only(events, OptionsEvent) and not only(events, ItineraryPatchEvent)
    assert retriever.searches[0][0] == "Is Rudas old?"
    system_turns = [m.content for m in provider.calls[0] if m.role == "system"]
    assert any("Background information" in s for s in system_turns)


async def test_selecting_in_a_slot_group_confirms_the_activity_with_a_hydrated_card():
    use_case, _, _ = planner()

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "slot:2:afternoon",
                    "card_ids": [GELLERT],
                },
                brief=brief(),
                stay=ASTORIA,
                days=[{}, {"afternoon": [GELLERT]}],
            )
        )
    )

    [activity] = ops_of(events, "put_activity")
    assert (activity.slot.day, activity.slot.part) == (2, "afternoon")
    assert activity.card.title == "Gellért Baths" and activity.card.lat is not None
    assert "Gellért Baths" in joined_text(events)


async def test_removing_an_activity_is_acknowledged():
    use_case, _, retriever = planner()

    events = await run(
        use_case(
            turn(
                action={
                    "type": "remove",
                    "slot": {"day": 1, "part": "morning"},
                    "card_id": PARLIAMENT,
                },
                brief=brief(),
                stay=ASTORIA,
                days=[{}],
            )
        )
    )

    assert only(events, TextEvent) and retriever.searches == []


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Alternatives for day 3 · morning", (3, "morning")),
        ("Alternativas para el día 2 · tarde", (2, "afternoon")),
    ],
)
async def test_change_requests_name_their_slot(message: str, expected: tuple[int, str]):
    use_case, _, _ = planner([picks()])

    events = await run(
        use_case(turn(message, brief=brief(), stay=ASTORIA, days=[{}, {}, {}]))
    )

    [group] = only(events, OptionsEvent)
    assert group.slot is not None and (group.slot.day, group.slot.part) == expected


# ─── Near-duplicate places ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("a", "b", "same"),
    [
        ("Rudas Baths", "Rudas Thermal Bath", True),
        ("Tourist Information Centre", "Tourist Information Centre - City Park", True),
        ("Budapest Zoo", "Budapest Eye", False),
        ("Gellért Baths", "Gellért Hill", False),
        ("Parliament", "Hungarian Parliament Building", False),
    ],
)
def test_two_sources_naming_one_place_count_as_one(a: str, b: str, same: bool):
    from ai_api.application.plan_trip import similar_titles, title_words

    assert similar_titles(title_words(a), title_words(b)) is same


async def test_the_same_place_from_two_sources_is_not_placed_twice():
    wikipedia_rudas = Document(
        id="wp:en:rudas#s1-c1",
        content="Rudas Baths is a thermal bath in Budapest built in 1550.",
        metadata={
            **BY_ID[RUDAS].metadata,
            "doc_id": "wp:en:rudas#s1-c1",
            "name": "Rudas Baths",
            "category": "history",
            "source": "wikipedia",
        },
    )
    small = [
        BY_ID[BELVAROS],
        BY_ID[ASTORIA],
        BY_ID[RUDAS],
        wikipedia_rudas,
        BY_ID[ANNA_CAFE],
        BY_ID[SZIMPLA],
    ]
    use_case, _, _ = planner(
        [
            skeleton(1),
            day_picks(
                morning=[{"id": "wp:en:rudas#s1-c1", "why": "Old."}],
                afternoon=[{"id": RUDAS, "why": "Again."}],
            ),
        ],
        documents=small,
    )

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
            )
        )
    )

    titles = [a.card.title for a in ops_of(events, "put_activity")]
    assert sum("Rudas" in t for t in titles) == 1


async def test_free_text_options_are_introduced_as_findings_not_alternatives():
    use_case, _, _ = planner(
        [
            json.dumps({"intent": "find_options", "kind": "restaurant", "day": 2}),
            picks(),
        ]
    )

    events = await run(
        use_case(
            turn(
                "Hungarian restaurants near day 2",
                brief=brief(),
                stay=ASTORIA,
                days=[{}, {}],
            )
        )
    )

    assert joined_text(events).startswith("Here is what I found")


# ─── Talking before a stay is chosen ─────────────────────────────────────────


async def test_a_question_after_the_neighbourhoods_were_offered_is_answered_not_repeated():
    use_case, provider, _ = planner(
        [json.dumps({})], deltas=("Belváros ", "is quieter.")
    )

    events = await run(
        use_case(
            turn(
                "which one is quieter?",
                brief=brief(),
                history=[
                    ("user", "Dates: 2026-10-20 · 2026-10-24"),
                    (
                        "assistant",
                        "These neighbourhoods fit your trip. Where would you like to stay?",
                    ),
                ],
            )
        )
    )

    assert not only(events, OptionsEvent) and not only(events, BriefEvent)
    assert joined_text(events) == "Belváros is quieter."
    # One extraction (unchanged brief), then the streamed answer: no ranking call.
    assert len(provider.completions) == 1 and len(provider.calls) == 1


async def test_a_change_of_brief_after_the_offer_ranks_neighbourhoods_again():
    use_case, _, _ = planner([json.dumps({"budget_tier": 3}), picks(BELVAROS)])

    events = await run(
        use_case(
            turn(
                "actually make it high-end",
                brief=brief(budget_tier=2),
                history=[
                    (
                        "assistant",
                        "These neighbourhoods fit your trip. Where would you like to stay?",
                    )
                ],
            )
        )
    )

    [brief_event] = only(events, BriefEvent)
    assert brief_event.brief.budget_tier == 3
    assert only(events, OptionsEvent)


async def test_the_day_title_is_streamed_before_the_days_activities():
    use_case, _, _ = planner([skeleton(1)])

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
            )
        )
    )

    patches = only(events, ItineraryPatchEvent)
    kinds = [[op.op for op in p.ops] for p in patches]
    assert kinds[0] == ["set_stay"] and kinds[1] == ["set_route"]
    assert kinds[2] == ["set_day_title"]
    assert "put_activity" in kinds[3]


async def test_spanish_warnings_and_day_titles():
    use_case, _, _ = planner(deltas=("not json",))

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
                history=[
                    ("user", "Quiero un viaje a Budapest desde Madrid para dos adultos")
                ],
            )
        )
    )

    [title] = ops_of(events, "set_day_title")
    assert title.title == "Día 1"
    for warning in ops_of(events, "warn"):
        assert " km" not in warning.message or "prevé transporte" in warning.message
    [weather] = ops_of(events, "set_weather")
    assert weather.summary.startswith("Un octubre típico")


# ─── Photos on every card (TRA-161) ──────────────────────────────────────────


async def test_every_activity_and_the_stay_carry_a_photo():
    finder = FakePhotoFinder(
        {
            "Anna Cafe": Photo(
                "https://commons.wikimedia.org/x.jpg",
                "Someone (CC0) · Wikimedia Commons",
            )
        }
    )
    use_case, _, _ = planner(
        [skeleton(1), day_picks(evening=[{"id": ANNA_CAFE, "why": "Close."}])],
        photos=finder,
    )

    events = await run(
        use_case(
            turn(
                action={
                    "type": "select",
                    "group_id": "hotels:x",
                    "card_ids": [ASTORIA],
                },
                brief=brief(start_date=date(2026, 10, 20), end_date=date(2026, 10, 20)),
            )
        )
    )

    [stay] = ops_of(events, "set_stay")
    activities = ops_of(events, "put_activity")
    assert stay.card.image_url and stay.card.image_credit
    assert all(a.card.image_url and a.card.image_credit for a in activities)
    by_id = {a.card.id: a.card for a in activities}
    # Found near the venue: the finder's photo, with its credit.
    assert by_id[ANNA_CAFE].image_url == "https://commons.wikimedia.org/x.jpg"
    # The corpus image wins when there is one: no lookup for it.
    assert (
        PARLIAMENT not in [BY_ID[ANNA_CAFE].id for _ in ()]
        and ("Parliament", 47.507, 19.046) not in finder.lookups
    )
    looked_up = {name for name, _, _ in finder.lookups}
    assert "Anna Cafe" in looked_up and "Parliament" not in looked_up
    # Every lookup names the city the trip is in.
    assert set(finder.cities) == {"Budapest"}
    # Nothing found and no corpus image of the hotel: a pictured hotel of the
    # same city stands in, credited as that hotel's photo — never the placeholder.
    assert stay.card.image_url.startswith("https://")
    assert not stay.card.image_credit.startswith("Illustrative")


async def test_a_card_with_no_photo_anywhere_takes_a_pictured_place_of_its_category():
    use_case, _, retriever = planner([picks(ANNA_CAFE)], photos=FakePhotoFinder())

    events = await run(
        use_case(
            turn(
                "Alternatives for day 1 · evening",
                brief=brief(),
                stay=ASTORIA,
                days=[{}],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    card = next(c for c in group.cards if c.id == ANNA_CAFE)
    # The fixture pictures no restaurant: a restaurant was looked for first,
    # then a pictured sight of the city stands in, credited as that sight's.
    assert card.image_url and card.image_url.startswith("https://")
    assert card.image_credit and not card.image_credit.startswith("Illustrative")
    fallback = [
        f.categories
        for _, _, f in retriever.searches
        if f is not None and f.categories in (("eat",), SIGHTS)
    ]
    assert fallback[-2:] == [("eat",), SIGHTS]
    assert all(f.city == "budapest" for _, _, f in retriever.searches if f is not None)


async def test_the_placeholder_only_when_the_corpus_pictures_nothing():
    unpictured = [
        Document(
            id=d.id,
            content=d.content,
            metadata={k: v for k, v in d.metadata.items() if k != "extra"},
        )
        for d in CORPUS
    ]
    use_case, _, _ = planner(
        [picks(ANNA_CAFE)], documents=unpictured, photos=FakePhotoFinder()
    )

    events = await run(
        use_case(
            turn(
                "Alternatives for day 1 · evening",
                brief=brief(),
                stay=ASTORIA,
                days=[{}],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert all(c.image_url for c in group.cards)
    card = next(c for c in group.cards if c.id == ANNA_CAFE)
    assert card.image_url and card.image_url.startswith("data:image/svg+xml")
    assert card.image_credit and card.image_credit.startswith("Illustrative photo")


async def test_pictured_places_are_offered_first():
    use_case, provider, _ = planner([picks()])

    events = await run(
        use_case(
            turn(
                "Alternatives for day 1 · morning",
                brief=brief(),
                stay=ASTORIA,
                days=[{}],
            )
        )
    )

    [group] = only(events, OptionsEvent)
    assert all(c.image_url for c in group.cards)
    shown = provider.completions[0][-2].content
    assert "| photo |" in shown


async def test_neighbourhoods_are_pictured_by_their_page_or_a_sight_of_theirs():
    page = "https://en.wikivoyage.org/wiki/Budapest/Belv%C3%A1ros"
    finder = FakePhotoFinder(
        pages={page: Photo("https://c/belvaros.jpg", "A (CC0) · Wikimedia Commons")}
    )
    use_case, _, _ = planner(
        [
            json.dumps({}),
            picks(BELVAROS, "wv:en:Budapest/Budavár#section:intro:c1"),
        ],
        photos=finder,
    )

    events = await run(use_case(turn("Looks good", brief=brief())))

    [group] = only(events, OptionsEvent)
    by_title = {c.title: c for c in group.cards}
    # The district page's own image, credited.
    assert by_title["Belváros"].image_url == "https://c/belvaros.jpg"
    # No page image known: a pictured sight of the district, never the generic photo.
    budavar = by_title["Budavár"]
    assert budavar.image_url and "Special:FilePath" in budavar.image_url
    assert budavar.image_credit and not budavar.image_credit.startswith("Illustrative")
    assert all(c.image_url for c in group.cards)
    assert page in finder.page_lookups
