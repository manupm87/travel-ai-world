"""The agent's tools and context (TRA-290, ADR 0032) over the Budapest sample.

Each test runs one call through the `Toolbox`, as the loop does, and pins
the result the model reads and the events the page gets. Write tools accept
only ids the turn knows; a place reaches the page only as a corpus card.
"""

import json
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pytest
from ai_api.application.agent.context import (
    build_context,
    build_pre_stay_context,
    last_hotels_district,
    neighbourhoods_offered,
    transcript,
)
from ai_api.application.agent.tools import (
    PRE_STAY_TOOLS,
    UNKNOWN_ID,
    AgentContext,
    Toolbox,
)
from ai_api.application.plan_trip import PlanTrip, Turn, _read_turn
from ai_api.application.tracing import TurnTracer
from ai_api.domain.agent import ToolCall
from ai_api.domain.models import Document, Message
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import (
    ItineraryPatchEvent,
    OptionsEvent,
    PlannerEvent,
    TextEvent,
    TripBrief,
)
from ai_api.testing import (
    BUDAPEST,
    FakeProvider,
    FakeRetriever,
    documents_from_corpus,
)

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"
CORPUS = documents_from_corpus(FIXTURE)
TODAY = date(2026, 9, 18)

ASTORIA = "wv:en:Budapest/Belváros#sleep:danubius-hotel-astoria"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
BASILICA = "wv:en:Budapest/Belváros#see:st-stephen-istvan-basilica"
BASTION = "wv:en:Budapest/Budavár#see:fisherman-s-bastion"
RUDAS = "wv:en:Budapest/Víziváros#do:rudas-thermal-bath"
GELLERT = "wv:en:Budapest/South Buda#do:gellert-baths"
ANNA_CAFE = "wv:en:Budapest/Belváros#eat:anna-cafe"
AUGUSZT = "wv:en:Budapest/Belváros#eat:downtown-auguszt-confectionery"
SZIMPLA = "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi"
INSTANT = "wv:en:Budapest/Terézváros#drink:instant-bar-club"
BELVAROS_INTRO = "wv:en:Budapest/Belváros#section:intro:c1"

DAYS: list[dict[str, list[str]]] = [
    {
        "morning": [PARLIAMENT],
        "afternoon": [BASILICA],
        "evening": [ANNA_CAFE],
        "night": [SZIMPLA],
    },
    {"morning": [BASTION], "afternoon": [RUDAS]},
]
"""The drafted trip: two days, the stay at the Astoria."""


def brief(**overrides: object) -> TripBrief:
    values = {
        "destination": "Budapest",
        "origin": "Madrid",
        "start_date": date(2026, 10, 20),
        "end_date": date(2026, 10, 21),
        "nights": 1,
        "adults": 2,
        "children": 0,
        "budget_tier": 2,
        "interests": ["thermal_baths", "history"],
        "pace": "balanced",
    }
    values.update(overrides)
    return TripBrief.model_validate(values)


def planner_turn(
    message: str = "Make day 2 better",
    *,
    days: Sequence[dict[str, list[str]]] = DAYS,
    stay: str | None = ASTORIA,
    history: Sequence[tuple[str, str]] = (),
    language: str = "en",
) -> PlannerTurn:
    empty = {"morning": [], "afternoon": [], "evening": [], "night": []}
    return PlannerTurn.model_validate(
        {
            "message": message,
            "action": None,
            "history": [{"role": r, "content": c} for r, c in history],
            "brief": brief().model_dump(),
            "itinerary": {
                "stay_card_id": stay,
                "days": [
                    {"day": i + 1, "slots": empty | slots}
                    for i, slots in enumerate(days)
                ],
            },
            "exclude_card_ids": [],
            "trip_id": None,
            "session_id": None,
            "language": language,
        }
    )


def make_planner(
    provider: FakeProvider | None = None,
    documents: Sequence[Document] = CORPUS,
    **kwargs: object,
) -> tuple[PlanTrip, FakeProvider, FakeRetriever]:
    provider = provider or FakeProvider()
    retriever = FakeRetriever(documents)
    plan = PlanTrip(
        provider,
        retriever,
        cities=[BUDAPEST],
        today=lambda: TODAY,
        **kwargs,  # type: ignore[arg-type]
    )
    return plan, provider, retriever


@dataclass
class Setup:
    turn: Turn
    plan: PlanTrip
    provider: FakeProvider
    retriever: FakeRetriever
    context: AgentContext
    toolbox: Toolbox
    tracer: TurnTracer


async def setup(
    message: str = "Make day 2 better",
    *,
    provider: FakeProvider | None = None,
    documents: Sequence[Document] = CORPUS,
    **turn_args: object,
) -> Setup:
    plan, provider, retriever = make_planner(provider, documents)
    turn = _read_turn(planner_turn(message, **turn_args))  # type: ignore[arg-type]
    tracer = TurnTracer("planner", "/planner", "1")
    turn.tracer = tracer
    context = await build_context(turn, plan)
    return Setup(turn, plan, provider, retriever, context, Toolbox(context), tracer)


def ops_of(events: Sequence[PlannerEvent]) -> list:
    return [op for e in events if isinstance(e, ItineraryPatchEvent) for op in e.ops]


def joined(events: Sequence[PlannerEvent]) -> str:
    return "".join(e.delta for e in events if isinstance(e, TextEvent))


def call(name: str, **arguments: object) -> ToolCall:
    return ToolCall(id=f"call-{name}", name=name, arguments=dict(arguments))


PLACE_KEYS = {"id", "title", "category", "district", "tier", "summary", "photo"}


def result(tool_result) -> dict:
    return json.loads(tool_result.content)


# ─── The context ─────────────────────────────────────────────────────────────


async def test_the_context_knows_the_trip_and_renders_it_with_titles():
    s = await setup()

    assert {ASTORIA, PARLIAMENT, BASILICA, RUDAS, SZIMPLA} <= set(s.context.known)
    [system] = s.context.system
    assert f"day 2 · afternoon · [{RUDAS}] Rudas Thermal Bath (do, Víziváros)" in system
    assert f"[{ASTORIA}] Danubius Hotel Astoria" in system
    assert "Budapest" in system and "English" in system
    # One fetch for the whole itinerary, traced with its own purpose.
    assert len(s.retriever.fetches) == 1
    fetches = [sp for sp in s.tracer.spans if sp.kind == "retriever"]
    assert fetches[0].payload["purpose"] == "agent_itinerary"


def test_the_transcript_alternates_and_ends_with_the_traveller():
    history = [
        Message("assistant", "Hi, where to?"),
        Message("user", "Budapest"),
        Message("user", "in October"),
        Message("assistant", "Done: a first itinerary."),
    ]

    messages = transcript(history, "Remove the bath")

    assert [m.role for m in messages] == ["user", "assistant", "user"]
    assert messages[0].text == "Budapest\n\nin October"
    assert messages[-1].text == "Remove the bath"


# ─── Read tools ──────────────────────────────────────────────────────────────


async def test_search_places_answers_compact_places_off_the_trip():
    s = await setup()

    found, events = await s.toolbox.call(
        call("search_places", query="baths", kind="sight")
    )

    places = result(found)["places"]
    assert not events and not found.is_error
    assert places and all(set(p) == PLACE_KEYS for p in places)
    assert all(len(p["summary"]) <= 200 for p in places)
    ids = [p["id"] for p in places]
    assert RUDAS not in ids and PARLIAMENT not in ids  # already on the trip
    assert all(p["category"] in {"see", "do", "tour", "history"} for p in places)
    assert set(ids) <= set(s.context.known)  # the ids later calls may use


async def test_search_places_never_returns_a_stay_and_narrows_bars():
    s = await setup()

    anything, _ = await s.toolbox.call(call("search_places", query="hotel", limit=8))
    bars, _ = await s.toolbox.call(call("search_places", query="drinks", kind="bar"))

    assert all(p["category"] != "sleep" for p in result(anything)["places"])
    bar_ids = [p["id"] for p in result(bars)["places"]]
    assert INSTANT in bar_ids and SZIMPLA not in bar_ids
    assert all(p["category"] == "drink" for p in result(bars)["places"])


async def test_a_named_place_comes_first():
    # The fake store answers in corpus order: the named bath is where an
    # unfiltered search finds it.
    gellert = next(d for d in CORPUS if d.id == GELLERT)
    s = await setup(documents=[gellert, *(d for d in CORPUS if d.id != GELLERT)])

    found, _ = await s.toolbox.call(
        call("search_places", query="Gellért Baths", kind="sight")
    )

    assert result(found)["places"][0]["id"] == GELLERT


async def test_districts_match_without_accents_and_an_unknown_one_lists_the_names():
    s = await setup()

    ok, _ = await s.toolbox.call(
        call("search_places", query="cafe", kind="restaurant", district="belvaros")
    )
    wrong, _ = await s.toolbox.call(
        call("search_places", query="cafe", district="Atlantis")
    )

    assert not ok.is_error
    searched = [f for _, _, f in s.retriever.searches if f and f.districts]
    assert searched and searched[0].districts == ("Belváros",)
    assert wrong.is_error
    assert "Belváros" in result(wrong)["districts"]


async def test_list_districts_names_the_neighbourhoods():
    s = await setup()

    found, _ = await s.toolbox.call(call("list_districts"))

    names = [d["name"] for d in result(found)["districts"]]
    assert set(names) == {"Belváros", "Budavár", "Erzsébetváros", "Víziváros"}


async def test_get_place_reads_a_known_or_fetchable_id_and_refuses_the_rest():
    s = await setup()

    known, _ = await s.toolbox.call(call("get_place", id=RUDAS))
    fetched, _ = await s.toolbox.call(call("get_place", id=GELLERT))
    missing, _ = await s.toolbox.call(call("get_place", id="wv:en:Budapest#see:prado"))

    assert result(known)["title"] == "Rudas Thermal Bath"
    assert len(result(known)["content"]) <= 800
    assert {"hours", "url", "address"} <= set(result(known))
    assert GELLERT in s.context.known  # fetched ids join the known ones
    assert not fetched.is_error
    assert missing.is_error and result(missing)["error"] == UNKNOWN_ID


async def test_get_weather_falls_back_to_the_climate_normals():
    s = await setup()

    found, _ = await s.toolbox.call(call("get_weather", day=2))
    beyond, _ = await s.toolbox.call(call("get_weather", day=5))

    answer = result(found)
    assert answer["date"] == "2026-10-21" and answer["source"] == "climate normals"
    assert "October" in answer["summary"]
    assert beyond.is_error and "days are 1 to 2" in result(beyond)["error"]


async def test_check_day_returns_the_warnings_and_emits_nothing():
    s = await setup()
    await s.toolbox.call(call("search_places", query="bath", kind="sight"))
    # A fifth activity on a balanced day.
    await s.toolbox.call(call("add_activity", id=GELLERT, day=1, part="afternoon"))

    checked, events = await s.toolbox.call(call("check_day", day=1))

    codes = [w["code"] for w in result(checked)["warnings"]]
    assert "overloaded_day" in codes
    assert not events


# ─── Write tools ─────────────────────────────────────────────────────────────


async def test_add_activity_refuses_an_id_no_tool_returned():
    s = await setup()

    refused, events = await s.toolbox.call(
        call("add_activity", id=GELLERT, day=2, part="evening")
    )

    assert refused.is_error and result(refused)["error"] == UNKNOWN_ID
    assert not events
    assert s.context.days[2]["evening"] == []


async def test_add_activity_puts_a_searched_place_on_the_day():
    s = await setup()
    await s.toolbox.call(call("search_places", query="Gellért Baths", kind="sight"))

    added, events = await s.toolbox.call(
        call("add_activity", id=GELLERT, day=2, part="evening")
    )

    [op] = ops_of(events)
    assert op.op == "put_activity" and op.card.id == GELLERT
    assert (op.slot.day, op.slot.part) == (2, "evening")
    assert op.card.image_url  # pictured, as every card
    assert result(added)["added"]["id"] == GELLERT
    assert s.context.days[2]["evening"] == [GELLERT]
    assert 2 in s.context.touched


async def test_add_activity_refuses_a_stay_text_and_a_place_already_on_the_trip():
    s = await setup()

    stay, _ = await s.toolbox.call(
        call("add_activity", id=ASTORIA, day=1, part="night")
    )
    again, _ = await s.toolbox.call(call("add_activity", id=RUDAS, day=1, part="night"))
    s.context.known[BELVAROS_INTRO] = next(
        d for d in s.retriever.documents if d.id == BELVAROS_INTRO
    )
    prose, _ = await s.toolbox.call(
        call("add_activity", id=BELVAROS_INTRO, day=1, part="night")
    )

    assert stay.is_error and "not an activity" in result(stay)["error"]
    assert again.is_error and "move_activity" in result(again)["error"]
    assert prose.is_error


async def test_remove_activity_finds_the_part_and_refuses_what_the_day_lacks():
    s = await setup()

    removed, events = await s.toolbox.call(call("remove_activity", id=RUDAS, day=2))
    absent, none = await s.toolbox.call(call("remove_activity", id=RUDAS, day=1))

    [op] = ops_of(events)
    assert op.op == "remove_activity" and op.card_id == RUDAS
    assert (op.slot.day, op.slot.part) == (2, "afternoon")
    assert result(removed)["removed"]["title"] == "Rudas Thermal Bath"
    assert RUDAS not in s.context.days[2]["afternoon"]
    assert absent.is_error and not none


async def test_move_activity_removes_then_puts_in_one_patch():
    s = await setup()

    moved, events = await s.toolbox.call(
        call("move_activity", id=BASILICA, from_day=1, to_day=2, to_part="evening")
    )

    [event] = events
    remove, put = event.ops
    assert remove.op == "remove_activity" and remove.card_id == BASILICA
    assert (remove.slot.day, remove.slot.part) == (1, "afternoon")
    assert put.op == "put_activity" and put.card.id == BASILICA
    assert (put.slot.day, put.slot.part) == (2, "evening")
    assert not moved.is_error
    assert s.context.touched == {1, 2}


async def test_set_day_title_strips_prices():
    s = await setup()

    named, events = await s.toolbox.call(
        call("set_day_title", day=1, title="Baths for 20 €")
    )

    [op] = ops_of(events)
    assert op.op == "set_day_title" and "20 €" not in op.title
    assert result(named)["title"] == op.title


async def test_redraft_day_replaces_the_whole_day():
    s = await setup()

    redone, events = await s.toolbox.call(
        call(
            "redraft_day",
            day=2,
            title="Pest's cafés",
            districts=["belvaros"],
            theme="coffee houses and sweets",
        )
    )

    [event] = events
    names = [op.op for op in event.ops]
    removed = {op.card_id for op in event.ops if op.op == "remove_activity"}
    assert removed == {BASTION, RUDAS}
    assert names.index("set_day_title") == len(removed)
    puts = [op for op in event.ops if op.op == "put_activity"]
    assert puts and all(op.slot.day == 2 for op in puts)
    new_ids = {op.card.id for op in puts}
    assert not new_ids & {BASTION, RUDAS}
    held = {i for ids in s.context.days[2].values() for i in ids}
    assert held == new_ids
    assert result(redone)["title"] == "Pest's cafés"
    # The day was checked as drafted: the turn's end does not check it again.
    assert s.context.validated == {2}
    assert s.toolbox.finish() == []


async def test_redraft_day_refuses_a_district_the_city_lacks():
    s = await setup()

    refused, events = await s.toolbox.call(
        call("redraft_day", day=2, title="X", districts=["Atlantis"], theme="y")
    )

    assert refused.is_error and not events


# ─── Offers ──────────────────────────────────────────────────────────────────


async def test_offer_options_sends_a_fresh_unplaced_group_of_known_cards():
    s = await setup()
    await s.toolbox.call(call("search_places", query="cafe", kind="restaurant"))

    offered, events = await s.toolbox.call(
        call("offer_options", ids=[AUGUSZT], heading="Sweets from 5 €")
    )
    again, more = await s.toolbox.call(
        call("offer_options", ids=[AUGUSZT], heading="Sweets")
    )

    [group] = events
    assert isinstance(group, OptionsEvent)
    assert group.group_id.startswith("found:") and group.slot is None
    assert group.kind == "restaurant" and "5 €" not in group.prompt
    assert [c.id for c in group.cards] == [AUGUSZT]
    assert result(offered)["offered"] == ["Downtown Auguszt Confectionery"]
    [second] = more
    assert second.group_id != group.group_id
    assert not again.is_error


async def test_offer_options_refuses_unknown_ids_and_places_on_the_trip():
    s = await setup()

    unknown, none = await s.toolbox.call(
        call("offer_options", ids=[GELLERT], heading="Baths")
    )
    held, nothing = await s.toolbox.call(
        call("offer_options", ids=[RUDAS], heading="Baths")
    )

    assert unknown.is_error and not none
    assert held.is_error and not nothing


async def test_offer_stays_forwards_the_hotel_carousel():
    s = await setup()
    s.toolbox.note_text()

    offered, events = await s.toolbox.call(call("offer_stays", mode="other_hotels"))

    [lead] = [e for e in events if isinstance(e, TextEvent)]
    [group] = [e for e in events if isinstance(e, OptionsEvent)]
    assert lead.delta.startswith("\n\n")
    assert group.group_id.startswith("hotels:") and group.kind == "hotel"
    assert ASTORIA not in [c.id for c in group.cards]
    assert result(offered)["offered"] == [c.title for c in group.cards]


# ─── Before the stay (TRA-291) ───────────────────────────────────────────────

NEIGHBOURHOODS_EN = "These neighbourhoods fit your trip. Where would you like to stay?"


async def pre_stay(
    message: str = "Show me other hotels",
    *,
    history: Sequence[tuple[str, str]] = (),
    language: str = "en",
) -> Setup:
    plan, provider, retriever = make_planner()
    request = planner_turn(
        message, days=[], stay=None, history=history, language=language
    )
    turn = _read_turn(request)
    tracer = TurnTracer("planner", "/planner", "1")
    turn.tracer = tracer
    context = await build_pre_stay_context(turn, plan)
    toolbox = Toolbox(context, PRE_STAY_TOOLS)
    return Setup(turn, plan, provider, retriever, context, toolbox, tracer)


def test_the_neighbourhoods_offered_are_read_in_either_language_anywhere():
    def said(*texts: str) -> list[Message]:
        return [Message("assistant", t) for t in texts]

    assert neighbourhoods_offered(said(NEIGHBOURHOODS_EN))
    assert neighbourhoods_offered(
        said(
            "¡Genial! Estos barrios encajan con tu viaje. ¿Dónde te gustaría alojarte?"
        )
    )
    assert not neighbourhoods_offered(said("Which dates?"))
    # The traveller quoting the sentence is not an offer.
    assert not neighbourhoods_offered([Message("user", NEIGHBOURHOODS_EN)])


@pytest.mark.parametrize(
    ("texts", "district"),
    [
        (["These places to stay are in or near Belváros:"], "Belváros"),
        (
            ["Good pick!\n\nEstos alojamientos están en Terézváros o muy cerca:"],
            "Terézváros",
        ),
        (
            [
                "These places to stay are in or near Belváros:",
                "Sure. These places to stay are in or near Budavár:",
            ],
            "Budavár",
        ),
        ([NEIGHBOURHOODS_EN], None),
        ([], None),
    ],
)
def test_the_last_hotels_district_is_the_latest_sentence_that_offered_them(
    texts: list[str], district: str | None
):
    history = [Message("assistant", t) for t in texts]

    assert last_hotels_district(history) == district


async def test_the_pre_stay_context_has_no_trip_and_names_the_last_hotels():
    s = await pre_stay(
        history=[
            ("assistant", NEIGHBOURHOODS_EN),
            ("assistant", "These places to stay are in or near Belváros:"),
        ]
    )

    assert s.context.days == {} and s.context.stay_id is None
    assert s.context.hotels_district == "Belváros"
    [system] = s.context.system
    assert "The hotels last offered were in: Belváros" in system
    assert "plan_for_me" in system and "Budapest" in system
    assert [spec.name for spec in s.toolbox.specs] == [
        "search_places",
        "get_place",
        "list_districts",
        "offer_neighbourhoods",
        "offer_hotels",
        "plan_for_me",
    ]
    assert s.retriever.fetches == []  # no itinerary to read


async def test_offer_neighbourhoods_forwards_the_nb_carousel():
    s = await pre_stay("other areas, please")
    s.toolbox.note_text()

    offered, events = await s.toolbox.call(call("offer_neighbourhoods"))

    [lead] = [e for e in events if isinstance(e, TextEvent)]
    [group] = [e for e in events if isinstance(e, OptionsEvent)]
    assert lead.delta.startswith("\n\n")  # after Kiri's own words
    assert group.group_id == "nb" and group.kind == "neighbourhood"
    assert result(offered)["offered"] == [c.title for c in group.cards]
    assert not offered.is_error


async def test_offer_hotels_without_a_district_reoffers_the_last_one_cheaper():
    s = await pre_stay(
        "cheaper ones",
        history=[("assistant", "These places to stay are in or near Belváros:")],
    )

    offered, events = await s.toolbox.call(call("offer_hotels", cheaper=True))

    [group] = [e for e in events if isinstance(e, OptionsEvent)]
    assert group.group_id == "hotels:Belváros" and group.kind == "hotel"
    first = s.retriever.searches[0][2]
    assert first is not None and first.districts == ("Belváros",)
    assert first.price_tier_max == 1
    assert result(offered)["district"] == "Belváros"


async def test_offer_hotels_takes_a_district_the_city_has_and_refuses_the_rest():
    s = await pre_stay("hotels in belvaros")

    offered, events = await s.toolbox.call(call("offer_hotels", district="belvaros"))
    refused, nothing = await s.toolbox.call(call("offer_hotels", district="Soho"))

    [group] = [e for e in events if isinstance(e, OptionsEvent)]
    assert group.group_id == "hotels:Belváros"
    assert result(offered)["district"] == "Belváros"
    assert refused.is_error and "Belváros" in result(refused)["districts"]
    assert nothing == []


async def test_plan_for_me_picks_the_stay_and_drafts_every_day():
    s = await pre_stay("decide tú", language="es")

    planned, events = await s.toolbox.call(call("plan_for_me"))

    [stay] = [op for op in ops_of(events) if op.op == "set_stay"]
    titles = [op for op in ops_of(events) if op.op == "set_day_title"]
    assert stay.card.category == "sleep"
    assert len(titles) == 2  # the brief's two days
    assert [op for op in ops_of(events) if op.op == "put_activity"]
    assert result(planned) == {"stay": stay.card.title, "days": 2}
    assert s.turn.stay_id == stay.card.id

    again, more = await s.toolbox.call(call("plan_for_me"))

    assert again.is_error and more == []


async def test_a_streaming_tool_is_a_traced_tool_span():
    s = await pre_stay()

    await s.toolbox.call(call("offer_neighbourhoods"))

    [span] = [sp for sp in s.tracer.spans if sp.kind == "tool"]
    assert span.name == "tool:offer_neighbourhoods"
    assert span.payload["status"] == "ok" and span.payload["count"] == 3


# ─── The turn's end ──────────────────────────────────────────────────────────


async def test_the_turn_ends_with_the_warnings_of_the_days_it_touched():
    s = await setup()
    await s.toolbox.call(call("search_places", query="bath", kind="sight"))
    await s.toolbox.call(call("add_activity", id=GELLERT, day=1, part="afternoon"))

    events = s.toolbox.finish()

    [event] = events
    assert all(op.op == "warn" for op in event.ops)
    assert "overloaded_day" in {op.code for op in event.ops}


async def test_a_redrafted_day_edited_again_is_checked_at_the_turn_end():
    s = await setup()
    await s.toolbox.call(
        call(
            "redraft_day",
            day=2,
            title="Pest's cafés",
            districts=["belvaros"],
            theme="coffee houses and sweets",
        )
    )
    await s.toolbox.call(call("search_places", query="bath", kind="sight"))
    # The redraft freed the Bastion and Rudas; the search found the Gellért.
    for doc_id, part in (
        (BASTION, "morning"),
        (RUDAS, "afternoon"),
        (GELLERT, "evening"),
    ):
        added, _ = await s.toolbox.call(
            call("add_activity", id=doc_id, day=2, part=part)
        )
        assert not added.is_error

    # A later edit undoes the redraft's check: the day is checked again.
    assert 2 not in s.context.validated
    [event] = s.toolbox.finish()
    assert event.ops and all(op.op == "warn" for op in event.ops)
    assert "overloaded_day" in {op.code for op in event.ops}


async def test_a_turn_that_changed_nothing_ends_without_a_patch():
    s = await setup()
    await s.toolbox.call(call("search_places", query="bath", kind="sight"))

    assert s.toolbox.finish() == []


async def test_a_tool_call_is_a_traced_tool_span():
    s = await setup()

    await s.toolbox.call(call("search_places", query="baths", kind="sight"))
    await s.toolbox.call(call("add_activity", id="made-up", day=1, part="night"))

    spans = [sp for sp in s.tracer.spans if sp.kind == "tool"]
    assert [sp.name for sp in spans] == ["tool:search_places", "tool:add_activity"]
    assert spans[0].payload["status"] == "ok" and spans[0].payload["count"] > 0
    assert spans[0].payload["service"] == "planner"
    assert json.loads(spans[0].payload["arguments"])["query"] == "baths"
    assert spans[1].payload["status"] == "error"
    assert ANNA_CAFE in s.context.known  # unchanged by the refusal
