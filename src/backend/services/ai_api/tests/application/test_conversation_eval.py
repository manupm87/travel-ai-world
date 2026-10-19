"""`application.conversation_eval` (TRA-288): the page's state, the checks, the
scenario files and whole runs, with no network."""

import json
from collections.abc import AsyncIterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from ai_api.application import conversation_eval as ev
from ai_api.application.cards import card_from_document
from ai_api.application.plan_trip import PlanTrip
from ai_api.infrastructure.cities import load_cities
from ai_api.schemas.planner import PlannerTurn, SelectAction
from ai_api.schemas.planner_events import (
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
    set_stay,
    text,
)
from ai_api.testing import (
    BUDAPEST,
    FakeProvider,
    FakeRetriever,
    documents_from_corpus,
)
from pydantic import ValidationError

SAMPLE = Path(__file__).parents[1] / "fixtures" / "budapest_sample.jsonl"
CORPUS = documents_from_corpus(SAMPLE)
BY_ID = {d.id: d for d in CORPUS}
CORPUS_DIR = Path(__file__).resolve().parents[4] / "tools" / "city_corpus" / "data"
TODAY = date(2026, 10, 19)

ASTORIA = "wv:en:Budapest/Belváros#sleep:danubius-hotel-astoria"
IBIS = "wv:en:Budapest/Erzsébetváros#sleep:ibis-budapest-city"
PARLIAMENT = "wv:en:Budapest/Belváros#see:parliament"
BASILICA = "wv:en:Budapest/Belváros#see:st-stephen-istvan-basilica"
BASTION = "wv:en:Budapest/Budavár#see:fisherman-s-bastion"
RUDAS = "wv:en:Budapest/Víziváros#do:rudas-thermal-bath"
ANNA_CAFE = "wv:en:Budapest/Belváros#eat:anna-cafe"
BOURBON = "wv:en:Budapest/Belváros#eat:le-bourbon-restaurant"
BELVAROS = "wv:en:Budapest/Belváros#section:intro:c1"
BUDAVAR = "wv:en:Budapest/Budavár#section:intro:c1"


def card(doc_id: str, why: str = "") -> OptionCard:
    return card_from_document(BY_ID[doc_id], why)


def slot(day: int, part: Any = "morning") -> Slot:
    return Slot(day=day, part=part)


def check(name: str, **params: Any) -> ev.Check:
    return ev.Check.model_validate({"check": name, **params})


def outcome(state: ev.ClientState, **fields: Any) -> ev.StepOutcome:
    result = ev.StepOutcome(
        before_key=state.itinerary_key(),
        before_stay=state.stay.id if state.stay else None,
    )
    for key, value in fields.items():
        setattr(result, key, value)
    return result


def trip() -> ev.ClientState:
    """Day 1: Parliament (morning), Basilica (afternoon), Le Bourbon (evening)."""
    state = ev.ClientState()
    state.apply(
        patch(
            set_stay(card(ASTORIA)),
            put_activity(slot(1), card(PARLIAMENT)),
            put_activity(slot(1, "afternoon"), card(BASILICA)),
            put_activity(slot(1, "evening"), card(BOURBON)),
            set_day_title(1, "Pest"),
        )
    )
    return state


# ─── ClientState: ops ────────────────────────────────────────────────────────


def test_put_appends_and_is_idempotent_by_id() -> None:
    state = ev.ClientState()
    state.apply_op(put_activity(slot(1), card(PARLIAMENT)))
    state.apply_op(put_activity(slot(1), card(BASILICA)))
    state.apply_op(put_activity(slot(1), card(PARLIAMENT, why="again")))

    morning = state.days[1]["morning"]
    assert [c.id for c in morning] == [PARLIAMENT, BASILICA]
    assert morning[0].why == "again"


def test_put_moves_a_card_across_the_parts_of_its_day() -> None:
    state = ev.ClientState()
    state.apply_op(put_activity(slot(1), card(PARLIAMENT)))
    state.apply_op(put_activity(slot(1, "evening"), card(PARLIAMENT)))
    state.apply_op(put_activity(slot(2), card(PARLIAMENT)))

    assert state.days[1]["morning"] == []
    assert [c.id for c in state.days[1]["evening"]] == [PARLIAMENT]
    # Another day is another place: the reducer only clears its own day.
    assert [c.id for c in state.days[2]["morning"]] == [PARLIAMENT]


def test_an_unpinned_slot_goes_to_the_morning() -> None:
    state = ev.ClientState()
    state.apply_op(put_activity(Slot(day=3, part=None), card(BASTION)))
    assert [c.id for c in state.days[3]["morning"]] == [BASTION]


def test_remove_filters_and_set_stay_replaces() -> None:
    state = trip()
    state.apply(patch(remove_activity(slot(1), PARLIAMENT), set_stay(card(IBIS))))

    assert state.days[1]["morning"] == []
    assert state.stay is not None and state.stay.id == IBIS
    assert state.day_titles == {1: "Pest"}


# ─── ClientState: interactions ───────────────────────────────────────────────


def test_text_deltas_join_one_bubble_and_options_split_them() -> None:
    state = ev.ClientState()
    state.turn_started("Hi")
    for event in (
        text("Here "),
        text("you go."),
        options("nb", "neighbourhood", "Where?", [card(BELVAROS)]),
        text("More text"),
    ):
        state.apply(event)
    state.turn_finished()

    kinds = [(m.kind, m.role, m.content) for m in state.messages]
    assert kinds == [
        ("text", "user", "Hi"),
        ("text", "assistant", "Here you go."),
        ("options", "assistant", ""),
        ("text", "assistant", "More text"),
    ]
    assert state.texts_this_turn == ["Here ", "you go.", "More text"]


def test_a_turn_without_text_leaves_no_empty_bubble() -> None:
    state = ev.ClientState()
    state.turn_started("Hi")
    state.apply(error_event("boom", "SERVICE_UNAVAILABLE"))
    state.turn_finished()

    assert [(m.kind, m.content) for m in state.messages] == [("text", "Hi")]
    assert state.errors == ["SERVICE_UNAVAILABLE: boom"]


def test_history_keeps_non_empty_text_bubbles_the_last_20() -> None:
    state = ev.ClientState()
    for n in range(15):
        state.turn_started(f"ask {n}")
        state.apply(text(f"answer {n}"))
        state.turn_finished()
    state.messages.append(ev.Bubble("selection", titles=("Parliament",)))

    history = state.history()
    assert len(history) == 20
    assert history[0].content == "ask 5"
    assert history[-1].content == "answer 14"


def test_options_for_a_known_slotted_group_append_new_cards() -> None:
    state = ev.ClientState()
    group = "slot:1:morning"
    state.apply(options(group, "experience", "p", [card(PARLIAMENT)], slot=slot(1)))
    state.apply(
        options(
            group, "experience", "p", [card(PARLIAMENT), card(BASTION)], slot=slot(1)
        )
    )

    assert [c.id for c in state.groups[group].cards] == [PARLIAMENT, BASTION]
    assert sum(m.kind == "options" for m in state.messages) == 1
    assert len(state.received) == 2


def test_an_answered_unslotted_group_restarts_at_the_foot() -> None:
    state = ev.ClientState()
    state.apply(options("nb", "neighbourhood", "p", [card(BELVAROS)]))
    state.selected("nb", [BELVAROS], None)
    state.apply(text("Other areas:"))
    state.apply(options("nb", "neighbourhood", "p", [card(BUDAVAR)]))

    group = state.groups["nb"]
    assert [c.id for c in group.cards] == [BUDAVAR]
    assert group.selected_ids == []
    assert [m.kind for m in state.messages] == ["selection", "text", "options"]


def test_a_single_pick_in_a_slotted_group_replaces_what_the_slot_held() -> None:
    state = trip()
    group = "slot:1:morning"
    state.apply(options(group, "experience", "p", [card(BASTION)], slot=slot(1)))
    state.selected(group, [BASTION], None)

    assert [c.id for c in state.days[1]["morning"]] == [BASTION]
    assert state.groups[group].selected_ids == [BASTION]
    assert state.messages[-1].titles == ("Fisherman's Bastion",)


def test_a_found_pick_adds_to_the_slot_the_traveller_named() -> None:
    state = trip()
    state.apply(options("found:ab12", "experience", "p", [card(RUDAS)]))
    state.selected("found:ab12", [RUDAS], slot(1))

    assert [c.id for c in state.days[1]["morning"]] == [PARLIAMENT, RUDAS]


def test_a_hotel_pick_sets_the_stay_at_once() -> None:
    state = trip()
    state.apply(options("hotels:Erzsébetváros", "hotel", "p", [card(IBIS)]))
    state.selected("hotels:Erzsébetváros", [IBIS], None)

    assert state.stay is not None and state.stay.id == IBIS


def test_patch_brief_patches_before_the_server_answers() -> None:
    state = ev.ClientState()
    state.patch_brief({"start_date": "2026-11-02", "adults": 2})
    assert state.brief.start_date == date(2026, 11, 2)
    assert state.brief.adults == 2


# ─── ClientState: the request ────────────────────────────────────────────────


def test_to_turn_sends_the_snapshot_and_the_history() -> None:
    state = trip()
    state.turn_started("First")
    state.apply(text("Answer"))
    state.turn_finished()

    request = state.to_turn("Next", None, "es")

    assert isinstance(request, PlannerTurn)
    assert request.message == "Next"
    assert request.language == "es"
    assert [(m.role, m.content) for m in request.history] == [
        ("user", "First"),
        ("assistant", "Answer"),
    ]
    assert request.itinerary is not None
    assert request.itinerary.stay_card_id == ASTORIA
    [day] = request.itinerary.days
    assert day.day == 1
    assert day.slots.morning == [PARLIAMENT]
    assert day.slots.afternoon == [BASILICA]
    assert day.slots.night == []
    assert request.exclude_card_ids == []


def test_begin_sends_the_history_before_the_turn_and_the_optimistic_state() -> None:
    state = trip()
    state.turn_started("First")
    state.apply(text("Answer"))
    state.apply(options("found:x1", "experience", "p", [card(RUDAS)]))
    state.turn_finished()
    action = SelectAction(
        type="select", group_id="found:x1", card_ids=[RUDAS], slot=slot(1, "night")
    )

    request = state.begin(None, "en", select=action)

    assert len(request.history) == 2
    assert request.action == action
    assert request.itinerary is not None
    assert request.itinerary.days[0].slots.night == [RUDAS]
    # The turn's own bubble is open: the next text lands in it.
    assert state.messages[-1].kind == "text" and state.messages[-1].content == ""


# ─── Checks ──────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("spec", "passed"),
    [
        ({"check": "slot_has", "day": 1, "part": "morning"}, True),
        ({"check": "slot_has", "day": 1, "part": "night"}, False),
        (
            {"check": "slot_has", "day": 1, "part": "evening", "categories": ["eat"]},
            True,
        ),
        (
            {"check": "slot_has", "day": 1, "part": "evening", "categories": ["see"]},
            False,
        ),
        (
            {
                "check": "slot_has",
                "day": 1,
                "part": "afternoon",
                "title_contains": "istvan",
            },
            True,
        ),
        ({"check": "slot_lacks", "day": 1, "title_contains": "Hacked"}, True),
        ({"check": "slot_lacks", "day": 1, "title_contains": "parliament"}, False),
        (
            {
                "check": "slot_lacks",
                "day": 1,
                "part": "evening",
                "title_contains": "Parliament",
            },
            True,
        ),
        ({"check": "day_count_at_least", "day": 1, "n": 3}, True),
        ({"check": "day_count_at_least", "day": 1, "n": 4}, False),
        ({"check": "day_count_at_least", "day": 1, "part": "morning", "n": 2}, False),
        ({"check": "day_count_at_most", "day": 1, "n": 3}, True),
        ({"check": "day_count_at_most", "day": 1, "n": 2}, False),
        ({"check": "day_count_at_most", "day": 2, "n": 2}, False),
        ({"check": "brief_field", "field": "adults", "value": 2}, True),
        ({"check": "brief_field", "field": "adults", "value": 3}, False),
        ({"check": "brief_field", "field": "interests", "value": "food"}, True),
        ({"check": "brief_field", "field": "start_date", "value": "2026-10-22"}, True),
    ],
)
def test_checks_on_the_state(spec: dict[str, Any], passed: bool) -> None:
    state = trip()
    state.brief = TripBrief.model_validate(
        {
            **TripBrief.empty().model_dump(),
            "adults": 2,
            "interests": ["food"],
            "start_date": "2026-10-22",
        }
    )
    result, detail = ev.evaluate(ev.Check.model_validate(spec), state, outcome(state))
    assert result is passed, detail


def test_itinerary_unchanged_and_stay_changed() -> None:
    state = trip()
    before = outcome(state)
    assert ev.evaluate(check("itinerary_unchanged"), state, before)[0]
    assert not ev.evaluate(check("stay_changed"), state, before)[0]

    state.apply(patch(set_stay(card(IBIS))))
    assert not ev.evaluate(check("itinerary_unchanged"), state, before)[0]
    assert ev.evaluate(check("stay_changed"), state, before)[0]


def test_an_empty_day_does_not_count_as_a_change() -> None:
    state = trip()
    before = outcome(state)
    state.apply(patch(set_day_title(4, "Spare")))
    assert ev.evaluate(check("itinerary_unchanged"), state, before)[0]


def test_options_offered_by_kind() -> None:
    state = trip()
    hotels = options("hotels:Belváros", "hotel", "p", [card(IBIS)])
    step = outcome(state, groups=[hotels])
    assert ev.evaluate(check("options_offered"), state, step)[0]
    assert ev.evaluate(check("options_offered", kind="hotel"), state, step)[0]
    assert not ev.evaluate(check("options_offered", kind="neighbourhood"), state, step)[
        0
    ]
    assert not ev.evaluate(check("options_offered"), state, outcome(state))[0]


def test_text_checks_read_the_step_text() -> None:
    state = trip()
    step = outcome(state, texts=["El Parlamento ", "es precioso y está cerca del río."])
    assert ev.evaluate(check("text_matches", pattern="PARLAMENTO"), state, step)[0]
    assert not ev.evaluate(check("text_matches", pattern="bastion"), state, step)[0]
    assert ev.evaluate(check("text_language", language="es"), state, step)[0]
    assert not ev.evaluate(check("text_language", language="en"), state, step)[0]


def test_text_language_is_not_biased_toward_the_expected_one() -> None:
    state = trip()
    # One word reads as nothing: the other language wins the tie.
    step = outcome(state, texts=["Budapest"])
    assert not ev.evaluate(check("text_language", language="en"), state, step)[0]
    assert not ev.evaluate(check("text_language", language="es"), state, step)[0]


def test_max_seconds_reads_the_slowest_turn() -> None:
    state = trip()
    assert ev.evaluate(
        check("max_seconds", n=10), state, outcome(state, seconds=[2.0, 9.5])
    )[0]
    assert not ev.evaluate(
        check("max_seconds", n=5), state, outcome(state, seconds=[2.0, 9.5])
    )[0]


def test_no_prices_reads_texts_and_whys() -> None:
    state = trip()
    state.turn_started("How much?")
    state.apply(text("Tiers only, never amounts."))
    assert ev.no_prices(state)[0]

    state.apply(options("found:1", "restaurant", "p", [card(ANNA_CAFE, "Mains 12 €")]))
    passed, detail = ev.no_prices(state)
    assert not passed and "12" in detail

    clean = trip()
    clean.turn_started("How much?")
    clean.apply(text("A ticket is about 5,000 HUF."))
    assert not ev.no_prices(clean)[0]


def test_no_error_events() -> None:
    state = trip()
    assert ev.no_error_events(state)[0]
    state.apply(error_event("down", "SERVICE_UNAVAILABLE"))
    assert ev.no_error_events(state) == (False, "SERVICE_UNAVAILABLE: down")


async def test_all_ids_in_corpus() -> None:
    retriever = FakeRetriever(CORPUS)
    state = trip()
    assert (await ev.all_ids_in_corpus(state, retriever))[0]

    invented = card(PARLIAMENT).model_copy(update={"id": "made:up", "title": "Up"})
    state.apply(options("found:2", "experience", "p", [invented]))
    passed, detail = await ev.all_ids_in_corpus(state, retriever)
    assert not passed and "made:up" in detail


def test_a_check_needs_its_parameters_and_no_others() -> None:
    with pytest.raises(ValidationError, match="needs"):
        check("slot_has", day=1)
    with pytest.raises(ValidationError, match="takes no"):
        check("stay_changed", day=1)
    with pytest.raises(ValidationError, match="no field"):
        check("brief_field", field="budget", value=1)
    with pytest.raises(ValidationError):
        check("text_matches", pattern="(")


def test_a_step_is_one_thing() -> None:
    with pytest.raises(ValidationError, match="one of"):
        ev.Step.model_validate({"say": "Hi", "setup": "draft"})
    with pytest.raises(ValidationError, match="patch_brief"):
        ev.Step.model_validate({"patch_brief": {"adults": 2}, "setup": "draft"})
    with pytest.raises(ValidationError, match="found"):
        ev.Step.model_validate({"select": {"group": "found"}})
    with pytest.raises(ValidationError):
        ev.Step.model_validate({"setup": "fixture:../etc"})


def test_fill_writes_dates_and_the_city() -> None:
    assert ev.fill("{city}: {date:+3} to {date:+12}", TODAY, "Budapest") == (
        "Budapest: 2026-10-22 to 2026-10-31"
    )


# ─── The scenario files ──────────────────────────────────────────────────────


def test_every_scenario_file_loads() -> None:
    scenarios = ev.load_scenarios()
    # Ids are unique across cities too: `--scenario` names one.
    ids = [s.id for s in scenarios]
    assert len(ids) == len(set(ids))
    assert len(scenarios) >= 24
    by_city = {
        city: [s for s in scenarios if s.city == city] for city in ev.scenario_cities()
    }
    assert len(by_city["budapest"]) >= 18
    assert len(by_city["bologna"]) >= 6
    assert {s.language for s in scenarios} == {"en", "es"}


def test_scenario_cities_are_in_the_manifest_and_files_named_by_id() -> None:
    known = {c.slug for c in load_cities()}
    root = Path(ev.__file__).parents[1] / "data" / "eval_conversations"
    for scenario in ev.load_scenarios():
        assert scenario.city in known
        assert (root / scenario.city / f"{scenario.id}.json").is_file()


def test_edit_question_and_safety_scenarios_start_from_a_fixture() -> None:
    for scenario in ev.load_scenarios():
        setups = [s.setup for s in scenario.steps if s.setup is not None]
        if "prestay" in scenario.tags:
            assert setups[0] in ("draft", "brief"), scenario.id
            continue
        assert setups and setups[0].startswith("fixture:"), scenario.id
        fixture = ev.load_fixture(setups[0].removeprefix("fixture:"))
        assert fixture.city == scenario.city, scenario.id


def test_the_scenarios_cover_the_brief() -> None:
    scenarios = ev.load_scenarios()
    tags = {tag for s in scenarios for tag in s.tags}
    assert {"edit", "compound", "redo", "stay", "question", "safety", "prestay"} <= tags
    safety = [s for s in scenarios if s.safety]
    assert len(safety) >= 4


@pytest.mark.parametrize("name", ["budapest-3d", "bologna-2d"])
def test_fixtures_name_documents_of_the_committed_corpus(name: str) -> None:
    fixture = ev.load_fixture(name)
    corpus = CORPUS_DIR / fixture.city / "documents.jsonl"
    ids = {
        json.loads(line)["doc_id"]
        for line in corpus.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    missing = [i for i in fixture.ids() if i not in ids]
    assert not missing
    brief = fixture.trip_brief(TODAY)
    assert brief.missing() == []
    assert brief.start_date == TODAY + timedelta(days=3)
    assert brief.end_date == TODAY + timedelta(days=3 + len(fixture.days) - 1)


# ─── Whole runs ──────────────────────────────────────────────────────────────


def write_fixture(root: Path) -> Path:
    fixtures = root / "fixtures"
    fixtures.mkdir(parents=True)
    (fixtures / "mini.json").write_text(
        json.dumps(
            {
                "city": "budapest",
                "brief": {
                    "destination": "Budapest",
                    "origin": "Madrid",
                    "adults": 2,
                    "interests": ["history"],
                    "pace": "balanced",
                },
                "stay": ASTORIA,
                "days": [
                    {
                        "day": 1,
                        "title": "Pest",
                        "slots": {"morning": [PARLIAMENT], "afternoon": [BASILICA]},
                    },
                    {"day": 2, "title": "Buda", "slots": {"morning": [BASTION]}},
                ],
            }
        ),
        encoding="utf-8",
    )
    return root


def scenario(**overrides: Any) -> ev.Scenario:
    values: dict[str, Any] = {
        "id": "ask-parliament",
        "city": "budapest",
        "language": "en",
        "tags": ["question"],
        "goal": "Answers about the Parliament and changes nothing.",
        "steps": [
            {"setup": "fixture:mini"},
            {"say": "What is special about the Parliament?"},
        ],
        "expect": [
            {"check": "itinerary_unchanged"},
            {"check": "text_matches", "pattern": "parliament"},
            {"check": "slot_has", "day": 2, "part": "morning"},
        ],
    }
    values.update(overrides)
    return ev.Scenario.model_validate(values)


def planner(provider: FakeProvider, retriever: FakeRetriever) -> PlanTrip:
    return PlanTrip(provider, retriever, cities=[BUDAPEST], today=lambda: TODAY)


async def test_a_scenario_plays_against_plan_trip(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    provider = FakeProvider(
        deltas=["The Parliament ", "is the grandest building on the Danube."],
        replies=['{"intent": "chat"}'],
    )
    retriever = FakeRetriever(CORPUS)

    report = await ev.run(
        [scenario()],
        lambda city: planner(provider, retriever),
        lambda city: retriever,
        city_names={"budapest": "Budapest"},
        today=lambda: TODAY,
        data=root,
    )

    [run] = report.runs
    assert run.setup_failed is None
    assert [(c.name, c.passed) for c in run.checks] == [
        ("itinerary_unchanged", True),
        ("text_matches(pattern=parliament)", True),
        ("slot_has(day=2, part=morning)", True),
        ("all_ids_in_corpus", True),
        ("no_prices", True),
        ("no_error_events", True),
    ]
    assert run.passed
    assert run.turns == 1
    # The planner saw the fixture as the page would send it.
    [classify] = provider.completions
    assert "Parliament" in "\n".join(m.content for m in classify)
    assert run.llm_calls == 2
    assert run.input_tokens == 6 and run.output_tokens == 4
    assert "Planner: The Parliament is the grandest" in run.transcript
    assert "Day 2 — Buda" in run.itinerary

    markdown = ev.to_markdown(report)
    assert "| `ask-parliament` | budapest | en | question | 6/6 | 1/1 |" in markdown
    assert "Checks passed: **6/6 (100%)**" in markdown
    assert not ev.safety_failed(report)


async def test_failures_safety_and_repeats_are_reported(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    retriever = FakeRetriever(CORPUS)
    injection = scenario(
        id="injection",
        tags=["safety"],
        expect=[{"check": "text_matches", "pattern": "never matches"}],
    )

    def factory(city: str) -> PlanTrip:
        provider = FakeProvider(deltas=["Sure."], replies=['{"intent": "chat"}'])
        return planner(provider, retriever)

    report = await ev.run(
        [injection],
        factory,
        lambda city: retriever,
        repeat=2,
        today=lambda: TODAY,
        data=root,
    )

    assert [r.run for r in report.runs] == [1, 2]
    assert ev.safety_failed(report)
    totals = ev.totals(report)
    assert totals.scenarios_passed == 0
    assert (totals.safety_passed, totals.safety) == (6, 8)
    markdown = ev.to_markdown(report)
    assert "| 0/2 |" in markdown
    assert "`injection` (run 2) **safety**: text_matches" in markdown


async def test_a_missing_fixture_id_is_a_setup_failure(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    retriever = FakeRetriever([d for d in CORPUS if d.id != BASTION])
    report = await ev.run(
        [scenario()],
        lambda city: planner(FakeProvider(), retriever),
        lambda city: retriever,
        today=lambda: TODAY,
        data=root,
    )
    [run] = report.runs
    assert run.setup_failed is not None and BASTION in run.setup_failed
    assert run.checks == [] and not run.passed
    assert "Setup failures: 1 of 1 runs." in ev.to_markdown(report)


async def test_a_select_with_nothing_to_pick_fails_the_rest(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    retriever = FakeRetriever(CORPUS)
    stuck = scenario(
        steps=[
            {"setup": "fixture:mini"},
            {"select": {"group": "hotels"}, "expect": [{"check": "stay_changed"}]},
        ]
    )
    report = await ev.run(
        [stuck],
        lambda city: planner(FakeProvider(), retriever),
        lambda city: retriever,
        today=lambda: TODAY,
        data=root,
    )
    [run] = report.runs
    names = [(c.name, c.passed, c.detail) for c in run.checks]
    assert names[0] == ("step 2", False, "no hotels group was offered")
    assert [n for n, _, d in names if d == "step not reached"] == [
        "stay_changed",
        "itinerary_unchanged",
        "text_matches(pattern=parliament)",
        "slot_has(day=2, part=morning)",
    ]


class ScriptedPlanner:
    """Answers like `PlanTrip` before the stay: the brief and the
    neighbourhoods, then hotels, then the stay and a day."""

    def __init__(self, *, offer_nb: bool = True) -> None:
        self.requests: list[PlannerTurn] = []
        self.offer_nb = offer_nb

    async def __call__(self, request: PlannerTurn) -> AsyncIterator[PlannerEvent]:
        self.requests.append(request)
        action = request.action
        if action is None:
            brief = TripBrief.model_validate(
                {
                    **TripBrief.empty().model_dump(),
                    "destination": "Budapest",
                    "origin": "Madrid",
                    "adults": 2,
                    "interests": ["history"],
                    **(
                        {
                            "start_date": TODAY + timedelta(days=3),
                            "end_date": TODAY + timedelta(days=5),
                        }
                        if len(self.requests) > 1
                        else {}
                    ),
                }
            )
            yield brief_event(brief)
            if brief.missing():
                yield text("Which dates?")
            elif self.offer_nb:
                yield options("nb", "neighbourhood", "Where?", [card(BELVAROS)])
        elif isinstance(action, SelectAction) and action.group_id == "nb":
            yield options("hotels:Belváros", "hotel", "Hotels", [card(ASTORIA)])
        else:
            yield patch(
                set_stay(card(ASTORIA)), put_activity(slot(1), card(PARLIAMENT))
            )
        yield done()


async def test_setup_draft_answers_the_checklist_then_picks(tmp_path: Path) -> None:
    retriever = FakeRetriever(CORPUS)
    scripted = ScriptedPlanner()
    drafted = scenario(
        id="draft",
        language="es",
        tags=["prestay"],
        steps=[{"setup": "draft"}],
        expect=[{"check": "day_count_at_least", "day": 1, "n": 1}],
    )
    report = await ev.run(
        [drafted],
        lambda city: scripted,
        lambda city: retriever,
        city_names={"budapest": "Budapest"},
        today=lambda: TODAY,
    )
    [run] = report.runs
    assert run.setup_failed is None and run.passed
    opening, dates, nb, hotel = scripted.requests
    assert opening.message is not None and "Budapest" in opening.message
    assert "2026-10-22" in opening.message and opening.language == "es"
    assert dates.message == "Fechas: 2026-10-22 · 2026-10-24"
    assert nb.action is not None and nb.action.type == "select"
    assert hotel.itinerary is not None and hotel.itinerary.stay_card_id == ASTORIA


async def test_setup_brief_without_neighbourhoods_fails_apart() -> None:
    retriever = FakeRetriever(CORPUS)
    scripted = ScriptedPlanner(offer_nb=False)
    report = await ev.run(
        [scenario(id="brief", tags=["prestay"], steps=[{"setup": "brief"}])],
        lambda city: scripted,
        lambda city: retriever,
        today=lambda: TODAY,
    )
    [run] = report.runs
    assert run.setup_failed is not None
    assert "no neighbourhoods" in run.setup_failed
    # The opening and up to three answers: then it gives up.
    assert len(scripted.requests) == 4


async def test_patch_brief_and_a_planner_crash(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    retriever = FakeRetriever(CORPUS)

    class Crashing:
        def __init__(self) -> None:
            self.requests: list[PlannerTurn] = []

        async def __call__(self, request: PlannerTurn) -> AsyncIterator[PlannerEvent]:
            self.requests.append(request)
            yield text("Working on it")
            raise RuntimeError("boom")

    crashing = Crashing()
    dated = scenario(
        steps=[
            {"setup": "fixture:mini"},
            {
                "patch_brief": {"start_date": "{date:+10}", "end_date": "{date:+12}"},
                "say": "Dates: {date:+10} · {date:+12}",
            },
        ],
        expect=[{"check": "brief_field", "field": "end_date", "value": "{date:+12}"}],
    )
    report = await ev.run(
        [dated],
        lambda city: crashing,
        lambda city: retriever,
        today=lambda: TODAY,
        data=root,
    )
    [request] = crashing.requests
    assert request.brief is not None
    assert request.brief.start_date == date(2026, 10, 29)
    assert request.message == "Dates: 2026-10-29 · 2026-10-31"
    [run] = report.runs
    checks = {c.name: c for c in run.checks}
    assert checks["brief_field(field=end_date, value={date:+12})"].passed
    assert not checks["no_error_events"].passed
    assert "internal" in checks["no_error_events"].detail


async def test_the_judge_reads_transcript_and_itinerary(tmp_path: Path) -> None:
    root = write_fixture(tmp_path)
    retriever = FakeRetriever(CORPUS)
    judge = FakeProvider(
        replies=['{"did_what_was_asked": 4, "tone": 5, "reason": "Fine."}']
    )
    report = await ev.run(
        [scenario()],
        lambda city: planner(
            FakeProvider(deltas=["The Parliament."], replies=['{"intent": "chat"}']),
            retriever,
        ),
        lambda city: retriever,
        judge=judge,
        today=lambda: TODAY,
        data=root,
    )
    [run] = report.runs
    assert run.verdict == ev.ConversationVerdict(
        did_what_was_asked=4, tone=5, reason="Fine."
    )
    [asked] = judge.completions
    assert "Traveller: What is special about the Parliament?" in asked[1].content
    assert "Stay: Danubius Hotel Astoria" in asked[1].content
    markdown = ev.to_markdown(report)
    assert "Judge (asked · tone)" in markdown and "4.0 · 5.0" in markdown
    assert report.judge_prompt is not None


def test_select_scenarios_by_id_and_tag() -> None:
    a = scenario(id="a", tags=["safety"])
    b = scenario(id="b", tags=["edit"])
    assert ev.select_scenarios([a, b]) == [a, b]
    assert ev.select_scenarios([a, b], ids=["b"]) == [b]
    assert ev.select_scenarios([a, b], tags=["safety"]) == [a]
