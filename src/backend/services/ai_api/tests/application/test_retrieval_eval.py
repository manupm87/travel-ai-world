"""`application.retrieval_eval` (TRA-263, TRA-272): the metrics, the runner over
a fake retriever, the report, and the shape of the committed question sets."""

import asyncio
from collections.abc import Sequence

import pytest
from ai_api.application import retrieval_eval as ev
from ai_api.domain.models import Document, RetrievalFilters
from ai_api.infrastructure.cities import load_cities
from ai_api.testing import FakeRetriever
from travel_common.exceptions import EntityNotFound

QUESTIONS_PER_CITY = 20
SPANISH_PER_CITY = 8
TWINS_PER_CITY = 3


def _doc(doc_id: str, city: str) -> Document:
    return Document(id=doc_id, content="", metadata={"city": city})


def test_recall_counts_the_expected_ids_within_k() -> None:
    found = ["a", "b", "c"]

    assert ev.recall_at(found, ["c", "z"], 2) == 0
    assert ev.recall_at(found, ["c", "z"], 3) == 0.5
    assert ev.recall_at(found, [], 3) == 0


def test_reciprocal_rank_is_one_over_the_first_expected_rank() -> None:
    assert ev.reciprocal_rank(["a", "b", "c"], ["c", "b"]) == 0.5
    assert ev.reciprocal_rank(["a"], ["z"]) == 0


async def test_each_question_is_searched_in_its_own_city() -> None:
    retriever = FakeRetriever(
        [_doc("bp-1", "budapest"), _doc("md-1", "madrid"), _doc("md-2", "madrid")]
    )
    questions = [
        ev.Question("madrid", "q1", "es", "museo", ("md-2",)),
        ev.Question("budapest", "q2", "en", "bath", ("bp-1", "bp-9")),
    ]

    results = await ev.evaluate(retriever, questions)

    assert [filters.city for _, _, filters in retriever.searches if filters] == [
        "madrid",
        "budapest",
    ]
    assert all(limit == ev.TOP_K for _, limit, _ in retriever.searches)
    assert results[0].found == ("md-1", "md-2")
    assert results[0].reciprocal_rank == 0.5
    assert results[1].recall(10) == 0.5
    assert await ev.missing_from_index(retriever, questions) == ["bp-9"]


class _SlowFirst(FakeRetriever):
    """Answers the first questions last, as concurrent searches may."""

    async def search(
        self,
        query: str,
        *,
        limit: int = 5,
        filters: RetrievalFilters | None = None,
    ) -> list[Document]:
        await asyncio.sleep(0.01 * (10 - int(query)))
        return [_doc(f"d{query}", "madrid")]


async def test_concurrent_searches_keep_the_questions_order() -> None:
    questions = [ev.Question("madrid", f"q{i}", "en", str(i), ()) for i in range(10)]

    results = await ev.evaluate(_SlowFirst(), questions, concurrency=4)

    assert [r.found for r in results] == [(f"d{i}",) for i in range(10)]


async def test_the_report_has_totals_groups_and_the_misses() -> None:
    retriever = FakeRetriever([_doc("md-1", "madrid")])
    questions = [
        ev.Question("madrid", "hit", "en", "a", ("md-1",)),
        ev.Question("madrid", "miss", "es", "b", ("md-1", "md-9")),
    ]

    report = ev.summarize(await ev.evaluate(retriever, questions), ["md-9"])
    text = ev.to_markdown(report)

    assert report.overall == ev.Scores("all", 2, 0.75, 0.75, 1.0)
    assert [s.label for s in report.by_language] == ["en", "es"]
    assert [(m.question.id, m.ranks) for m in report.misses] == [("miss", (1, None))]
    assert "| **all** | 2 | 0.750 | 0.750 | 1.000 |" in text
    assert "| lang `es` | 1 | 0.500 | 0.500 | 1.000 |" in text
    assert "- `md-9`" in text
    assert '- madrid/miss (es) "b": `md-1` #1, `md-9` —' in text


def test_an_unknown_city_has_no_questions() -> None:
    with pytest.raises(EntityNotFound):
        ev.load_questions("atlantis")


def test_every_planner_city_has_a_question_set() -> None:
    assert ev.cities_with_questions() == sorted(c.slug for c in load_cities())


def _twins(questions: Sequence[ev.Question]) -> list[tuple[ev.Question, ev.Question]]:
    by_id = {q.id: q for q in questions}
    return [
        (by_id[q.id.removesuffix("-es")], q)
        for q in questions
        if q.id.endswith("-es") and q.id.removesuffix("-es") in by_id
    ]


@pytest.mark.parametrize("city", ev.cities_with_questions())
def test_a_city_has_twenty_questions_eight_in_spanish(city: str) -> None:
    questions = ev.load_questions(city)
    twins = _twins(questions)

    assert len(questions) == QUESTIONS_PER_CITY
    assert sum(q.lang == "es" for q in questions) == SPANISH_PER_CITY
    assert len({q.id for q in questions}) == len(questions)
    assert all(q.lang in {"en", "es"} and q.expected for q in questions)
    assert len(twins) >= TWINS_PER_CITY
    for english, spanish in twins:
        assert (english.lang, spanish.lang) == ("en", "es")
        assert english.expected == spanish.expected
