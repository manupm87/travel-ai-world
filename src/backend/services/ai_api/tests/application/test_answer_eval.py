"""`application.answer_eval` (TRA-266): an answer built like the planner's chat,
the judge's verdict parsed and repaired, failures kept, and the report."""

import json

import pytest
from ai_api.application import answer_eval as ev
from ai_api.application.plan_trip import EMPTY_ITINERARY, chat_messages
from ai_api.domain.models import Document, Usage
from ai_api.infrastructure.cities import load_cities
from ai_api.prompts import JUDGE_PROMPT
from ai_api.testing import FakeProvider, FakeRetriever

BATHS = Document(
    id="wv:bath",
    content="Gellért Baths, open 6:00-20:00.",
    metadata={"city": "budapest", "name": "Gellért Baths", "category": "do"},
)
QUESTION = ev.Item("budapest", "baths", "en", "Which bath is on the Buda side?", True)


def verdict(**overrides: object) -> str:
    fields: dict[str, object] = {
        "groundedness": 5,
        "relevance": 4,
        "acknowledges_gap": False,
        "unsupported_claims": [],
        "reason": "Supported.",
    }
    return json.dumps({**fields, **overrides})


def graded(
    item: ev.Item, g: int, r: int, *, gap: bool = False, model: str = "fake"
) -> ev.Graded:
    return ev.Graded(
        item=item,
        passages=("d1",),
        answer=f"answer to {item.id}",
        verdict=ev.Verdict(
            groundedness=g,
            relevance=r,
            acknowledges_gap=gap,
            unsupported_claims=[] if g >= 3 else ["it opens at 9:00"],
            reason="r",
        ),
        answer_usage=Usage(
            model="eu.anthropic.claude-haiku-4-5-x",
            input_tokens=1_000,
            output_tokens=100,
        ),
        judge_usage=Usage(
            model="eu.amazon.nova-pro-v1:0", input_tokens=2_000, output_tokens=50
        ),
    )


def test_chat_messages_carry_the_passages_only_when_there_are_some() -> None:
    with_passages = chat_messages("es", EMPTY_ITINERARY, [BATHS], (), "¿Qué baño?")
    without = chat_messages("es", EMPTY_ITINERARY, [], (), "¿Qué baño?")

    assert [m.role for m in with_passages] == ["system", "system", "system", "user"]
    assert "Gellért Baths, open 6:00-20:00." in with_passages[2].content
    assert "Spanish" in with_passages[0].content
    assert [m.role for m in without] == ["system", "system", "user"]
    assert without[-1].content == "¿Qué baño?"


async def test_an_answer_is_built_like_the_planner_chat_and_judged() -> None:
    retriever = FakeRetriever([BATHS])
    answerer = FakeProvider(replies=["Try the Gellért Baths."])
    judge = FakeProvider(replies=[verdict()])

    result = await ev.grade(QUESTION, retriever, answerer, judge)

    assert retriever.searches[0][1:] == (6, retriever.searches[0][2])
    assert retriever.searches[0][2] is not None
    assert retriever.searches[0][2].city == "budapest"
    shown = answerer.completions[0]
    assert shown == chat_messages("en", EMPTY_ITINERARY, [BATHS], (), QUESTION.query)
    judged = judge.completions[0]
    assert judged[0].content == JUDGE_PROMPT
    assert "Try the Gellért Baths." in judged[1].content
    assert "Gellért Baths, open 6:00-20:00." in judged[1].content
    assert result.passages == ("wv:bath",)
    assert result.verdict.relevance == 4
    assert result.answer_usage.model == "fake-model"


async def test_a_verdict_out_of_range_is_repaired_once() -> None:
    judge = FakeProvider(replies=[verdict(groundedness=7), verdict(groundedness=2)])

    result = await ev.grade(
        QUESTION, FakeRetriever([BATHS]), FakeProvider(replies=["a"]), judge
    )

    assert result.verdict.groundedness == 2
    assert len(judge.completions) == 2


async def test_a_question_the_judge_cannot_grade_is_a_failure() -> None:
    # The first question gets two answers that are no JSON; the second, a verdict.
    judge = FakeProvider(replies=["not json", "still not json", verdict()])
    other = ev.Item("budapest", "other", "es", "¿Algo más?", True)
    answerer = FakeProvider(replies=["a", "b"])

    results = await ev.run(
        [QUESTION, other], FakeRetriever([BATHS]), answerer, judge, concurrency=1
    )

    assert isinstance(results[0], ev.Failure)
    assert results[0].item == QUESTION
    assert isinstance(results[1], ev.Graded)


def test_the_report_keeps_unanswerable_and_turned_down_apart() -> None:
    madrid_es = ev.Item("madrid", "m1", "es", "q", True)
    madrid_en = ev.Item("madrid", "m2", "en", "q", True)
    berlin = ev.Item("berlin", "b1", "en", "q", True)
    unanswerable = ev.Item("berlin", "u1", "en", "q", False)
    failure = ev.Failure(ev.Item("miami", "f1", "en", "q", True), "boom")
    results = [
        graded(madrid_es, 5, 5),
        graded(madrid_en, 2, 4),
        graded(berlin, 4, 2, gap=True),
        graded(unanswerable, 5, 5, gap=True),
        failure,
    ]

    report = ev.summarize(results)

    assert report.overall == ev.Means("all", 3, 11 / 3, 11 / 3, 2 / 3)
    assert [m.label for m in report.by_city] == ["berlin", "madrid"]
    assert [m.label for m in report.by_language] == ["en", "es"]
    assert [g.item.id for g in report.unanswerable] == ["u1"]
    assert [g.item.id for g in report.turned_down] == ["b1"]
    assert [g.item.id for g in report.worst] == ["b1", "m2"]
    assert report.failures == [failure]
    assert report.answering.input_tokens == 4_000
    assert report.answering.usd == pytest.approx((4_000 * 1.0 + 400 * 5.0) / 1e6)
    assert report.judging.usd == pytest.approx((8_000 * 0.8 + 200 * 3.2) / 1e6)
    text = ev.to_markdown(report)
    assert "| **all** | 3 | 3.67 | 3.67 | 67% |" in text
    assert "1 of 1 answers say the information is not available" in text
    assert "unsupported: it opens at 9:00" in text
    assert "- miami/f1: boom" in text


def test_every_planner_city_has_one_unanswerable_question() -> None:
    cities = sorted(c.slug for c in load_cities())
    unanswerable = [i for i in ev.load_items(cities) if not i.answerable]

    assert sorted(i.city for i in unanswerable) == cities
    assert len({i.id for i in unanswerable}) == len(unanswerable)
    assert {i.lang for i in unanswerable} == {"en", "es"}
