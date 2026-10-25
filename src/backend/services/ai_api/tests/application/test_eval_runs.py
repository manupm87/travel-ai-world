"""`application.eval_runs`: a run is stored as it goes and guarded against another."""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from ai_api.application import answer_eval, judge_validation
from ai_api.application.eval_runs import EvalRuns
from ai_api.domain.models import Document
from ai_api.schemas.answer_eval import EvalProgressEvent, EvalReportEvent
from ai_api.testing import FakeProvider, FakeRetriever, InMemoryEvalStore
from travel_common.exceptions import (
    Conflict,
    EntityNotFound,
    ProviderUnavailable,
)

NOW = datetime(2026, 10, 25, 12, 0, tzinfo=UTC)

BATHS = Document(
    id="wv:bath",
    content="Gellért Baths, open 6:00-20:00.",
    metadata={"city": "budapest", "name": "Gellért Baths", "category": "do"},
)

QUESTIONS = [
    answer_eval.Item("budapest", "baths", "en", "Which bath?", True),
    answer_eval.Item("budapest", "rate", "en", "Today's exchange rate?", False),
]

CASE = judge_validation.Case(
    id="budapest/baths~price",
    city="budapest",
    lang="en",
    query="Which bath?",
    answerable=True,
    passages=("wv:bath",),
    context="Gellért Baths, open 6:00-20:00.",
    answer="The Gellért Baths, 30 EUR.",
    origin="perturbed",
    defect="invented-price",
    expected=judge_validation.Expected(2, 5, False),
    why="The price is not in the passage.",
)


def verdict(g: int = 5, r: int = 5, *, gap: bool = False) -> str:
    return json.dumps(
        {
            "groundedness": g,
            "relevance": r,
            "acknowledges_gap": gap,
            "unsupported_claims": [],
            "reason": "r",
        }
    )


@pytest.fixture(autouse=True)
def small_sets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(answer_eval, "load_items", lambda cities: list(QUESTIONS))
    monkeypatch.setattr(judge_validation, "load_cases", lambda: [CASE])


def runs(
    store: InMemoryEvalStore,
    judge: FakeProvider,
    *,
    answerer: FakeProvider | None = None,
    clock: datetime = NOW,
) -> EvalRuns:
    return EvalRuns(
        store,
        judge=judge,
        judge_model="eu.amazon.nova-pro-v1:0",
        answerer=answerer,
        answer_model="eu.anthropic.claude-haiku-4-5-x",
        retriever=FakeRetriever([BATHS]) if answerer else None,
        index="bucket/index",
        clock=lambda: clock,
    )


async def test_a_questions_run_streams_each_answer_then_stores_the_report():
    store = InMemoryEvalStore()
    evals = runs(
        store,
        FakeProvider(replies=[verdict(), verdict(5, 5, gap=True)]),
        answerer=FakeProvider(replies=["Gellért.", "I can't tell."]),
    )

    started = await evals.start("questions")
    assert store.runs[started.run.run_id].status == "running"
    events = [e async for e in evals.events(started)]

    progress = [e for e in events if isinstance(e, EvalProgressEvent)]
    assert [e.done for e in progress] == [1, 2]
    assert {e.item.key for e in progress} == {"budapest/baths", "budapest/rate"}
    [report] = [e for e in events if isinstance(e, EvalReportEvent)]
    run = report.run
    assert run.status == "done"
    assert (run.graded, run.failed, run.total) == (2, 0, 2)
    assert run.answers is not None
    assert run.answers.overall.answers == 1
    assert run.answers.unanswerable_acknowledged == 1
    assert run.answer_model == "eu.anthropic.claude-haiku-4-5-x"
    assert run.index == "bucket/index"
    stored = store.runs[run.run_id]
    assert stored.status == "done"
    assert set(store.items[run.run_id]) == {"budapest/baths", "budapest/rate"}


async def test_a_golden_run_judges_the_cases_and_measures_agreement():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=[verdict(4, 5)]))

    started = await evals.start("golden")
    events = [e async for e in evals.events(started)]

    run = events[-1].run if isinstance(events[-1], EvalReportEvent) else None
    assert run is not None and run.agreement is not None
    assert run.answer_model is None
    assert run.agreement.disagreements == ["budapest/baths~price"]
    detail = await evals.detail(run.run_id)
    [item] = detail.items
    assert item.expected is not None and item.expected.groundedness == 2
    assert item.verdict is not None and item.verdict.groundedness == 4
    assert item.origin == "perturbed"


async def test_a_second_run_while_one_is_running_is_refused():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=[verdict()]))
    await evals.start("golden")

    with pytest.raises(Conflict):
        await evals.start("golden")


async def test_a_run_left_running_past_the_timeout_reads_as_interrupted():
    store = InMemoryEvalStore()
    await runs(store, FakeProvider()).start("golden")
    later = runs(store, FakeProvider(), clock=NOW + timedelta(minutes=16))

    [run] = await later.history(10)

    assert run.status == "interrupted"
    await later.start("golden")  # an interrupted run blocks nothing


async def test_a_questions_run_without_retrieval_is_unavailable():
    with pytest.raises(ProviderUnavailable):
        await runs(InMemoryEvalStore(), FakeProvider()).start("questions")


async def test_a_run_where_every_answer_fails_is_stored_as_failed():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=["no", "no"]))

    started = await evals.start("golden")
    events = [e async for e in evals.events(started)]

    last = events[-1]
    assert isinstance(last, EvalReportEvent)
    assert last.run.status == "failed"
    assert last.run.error == "no golden case was judged"
    assert store.runs[started.run.run_id].status == "failed"


async def test_a_store_that_fails_mid_run_marks_the_run_failed():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=[verdict()]))
    started = await evals.start("golden")
    broken = ProviderUnavailable("Evaluation store unavailable (Boom)")

    async def fail(run_id: str, items: object) -> None:
        raise broken

    store.add_items = fail  # type: ignore[method-assign]

    with pytest.raises(ProviderUnavailable):
        _ = [e async for e in evals.events(started)]
    assert store.runs[started.run.run_id].status == "failed"


async def test_two_starts_at_once_let_only_one_run():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider())

    results = await asyncio.gather(
        evals.start("golden"), evals.start("golden"), return_exceptions=True
    )

    assert sum(isinstance(r, Conflict) for r in results) == 1


async def test_a_finished_run_gives_the_lock_back():
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=[verdict(), verdict()]))

    first = await evals.start("golden")
    _ = [e async for e in evals.events(first)]

    await evals.start("golden")  # no conflict: the first one released the lock


async def test_a_client_that_leaves_mid_run_leaves_a_failed_run_with_its_items(
    monkeypatch: pytest.MonkeyPatch,
):
    second = replace(CASE, id="budapest/other")
    monkeypatch.setattr(judge_validation, "load_cases", lambda: [CASE, second])
    store = InMemoryEvalStore()
    evals = runs(store, FakeProvider(replies=[verdict(), verdict()]))
    started = await evals.start("golden")

    stream = evals.events(started)
    await anext(stream)  # one item graded, not yet written
    await stream.aclose()  # the response is closed under it

    run = store.runs[started.run.run_id]
    assert run.status == "failed"
    assert run.data["error"] == "Cancelled: the client left before the end"
    assert len(store.items[started.run.run_id]) == 1
    await evals.start("golden")  # the lock was given back


async def test_an_unknown_run_is_not_found():
    with pytest.raises(EntityNotFound):
        await runs(InMemoryEvalStore(), FakeProvider()).detail("nope")
