"""`application.judge_validation`: the golden set, Cohen's kappa and the report."""

import asyncio
import json

import pytest
from ai_api.application import answer_eval
from ai_api.application import judge_validation as jv
from ai_api.domain.models import Usage
from ai_api.prompts import JUDGE_PROMPT
from ai_api.testing import FakeProvider


def case(
    case_id: str = "budapest/baths",
    *,
    g: int = 5,
    r: int = 5,
    gap: bool = False,
    origin: jv.Origin = "real",
) -> jv.Case:
    return jv.Case(
        id=case_id,
        city=case_id.split("/")[0],
        lang="en",
        query="Which bath is on the Buda side?",
        answerable=True,
        passages=("wv:bath",),
        context="Gellért Baths, open 6:00-20:00.",
        answer="The Gellért Baths.",
        origin=origin,
        defect=None if origin == "real" else "invented-price",
        expected=jv.Expected(g, r, gap),
        why="w",
    )


def judged(c: jv.Case, g: int, r: int, *, gap: bool = False) -> jv.Judged:
    return jv.Judged(
        c,
        answer_eval.Verdict(
            groundedness=g,
            relevance=r,
            acknowledges_gap=gap,
            unsupported_claims=[],
            reason=f"reason {c.id}",
        ),
        Usage(model="eu.amazon.nova-pro-v1:0", input_tokens=1_000, output_tokens=40),
    )


def test_kappa_is_one_for_perfect_agreement_and_zero_for_chance():
    assert jv.cohen_kappa([1, 2, 3], [1, 2, 3], jv.SCORES) == pytest.approx(1.0)
    # each rater splits 50/50 and they agree half the time: no better than chance
    assert jv.cohen_kappa([0, 0, 1, 1], [0, 1, 0, 1], (0, 1)) == pytest.approx(0.0)


def test_kappa_matches_a_hand_computed_value():
    # po = 0.7; pe = 0.5·0.6 + 0.5·0.4 = 0.5; kappa = (0.7 - 0.5) / 0.5 = 0.4
    expected = [1] * 5 + [0] * 5
    judged_ = [1, 1, 1, 1, 0, 1, 1, 0, 0, 0]

    assert jv.cohen_kappa(expected, judged_, (0, 1)) == pytest.approx(0.4)


def test_quadratic_kappa_forgives_near_misses_more_than_far_ones():
    expected = [1, 2, 3, 4, 5]
    near = jv.cohen_kappa(expected, [2, 2, 3, 4, 4], jv.SCORES, quadratic=True)
    far = jv.cohen_kappa(expected, [5, 2, 3, 4, 1], jv.SCORES, quadratic=True)

    assert near is not None and far is not None
    assert near > far


def test_quadratic_kappa_matches_a_hand_computed_value():
    # disagreement Σw·o = 2/80; chance Σw·e = 0.175, so kappa = 1 - 0.025/0.175 = 6/7
    kappa = jv.cohen_kappa([1, 2, 3, 4, 5], [2, 2, 3, 4, 4], jv.SCORES, quadratic=True)

    assert kappa == pytest.approx(6 / 7)


def test_kappa_is_undefined_when_both_raters_always_give_one_label():
    assert jv.cohen_kappa([5, 5, 5], [5, 5, 5], jv.SCORES, quadratic=True) is None


async def test_a_case_is_judged_on_its_frozen_passages_and_answer():
    judge = FakeProvider(
        replies=[
            json.dumps(
                {
                    "groundedness": 5,
                    "relevance": 5,
                    "acknowledges_gap": False,
                    "unsupported_claims": [],
                    "reason": "ok",
                }
            )
        ]
    )

    result = await jv.judge_case(case(), judge)

    [messages] = judge.completions
    assert messages[0].content == JUDGE_PROMPT
    assert "Gellért Baths, open 6:00-20:00." in messages[1].content
    assert "The Gellért Baths." in messages[1].content
    assert result.agrees


async def test_a_case_the_judge_cannot_grade_is_a_failure():
    results = [r async for r in jv.stream([case()], FakeProvider(replies=["nope"]))]

    assert isinstance(results[0], jv.CaseFailure)


def test_the_report_measures_agreement_by_score_and_origin():
    exact = case("madrid/a", g=5, r=5)
    near = case("madrid/b", g=4, r=5)
    perturbed = case("madrid/c~price", g=2, r=5, origin="perturbed")
    missed_gap = case("madrid/d", g=5, r=5, gap=True)
    results = [
        judged(exact, 5, 5),
        judged(near, 5, 5),
        judged(perturbed, 4, 5),
        judged(missed_gap, 5, 5, gap=False),
        jv.CaseFailure(case("madrid/e"), "boom"),
    ]

    report = jv.summarize(results)

    assert report.cases == 4
    assert report.groundedness.exact == pytest.approx(0.5)
    assert report.groundedness.within_one == pytest.approx(0.75)
    assert report.groundedness.confusion[1][3] == 1  # expected 2, judged 4
    assert report.relevance.kappa is None  # every relevance is 5
    assert report.low_agreement == pytest.approx(0.75)
    assert report.gap_accuracy == pytest.approx(0.75)
    assert report.exact_real == pytest.approx(1 / 3)
    assert report.exact_perturbed == pytest.approx(0.0)
    assert [j.case.id for j in report.disagreements] == [
        "madrid/c~price",
        "madrid/b",
        "madrid/d",
    ]
    assert report.judging.input_tokens == 4_000
    text = jv.to_markdown(report)
    assert "| groundedness | 50% | 75% |" in text
    assert "- failed madrid/e: boom" in text


def test_a_report_with_nothing_judged_is_refused():
    with pytest.raises(ValueError, match="no golden case"):
        jv.summarize([jv.CaseFailure(case(), "boom")])


def test_the_golden_set_is_fifty_labelled_cases_with_frozen_passages():
    cases = jv.load_cases()

    assert len(cases) >= 50
    assert len({c.id for c in cases}) == len(cases)
    assert {c.origin for c in cases} == {"real", "perturbed"}
    for c in cases:
        assert c.context.strip() and c.answer.strip() and c.why.strip(), c.id
        assert 1 <= c.expected.groundedness <= 5, c.id
        assert 1 <= c.expected.relevance <= 5, c.id
        assert (c.defect is None) == (c.origin == "real"), c.id
        assert c.id.startswith(f"{c.city}/"), c.id
    # without bad answers every score would be 5 and kappa would say nothing
    assert (
        sum(min(c.expected.groundedness, c.expected.relevance) < 3 for c in cases) >= 10
    )


class HangingJudge(FakeProvider):
    """Answers the first case, then waits until cancelled, counting the cancellations."""

    def __init__(self, reply: str) -> None:
        super().__init__(replies=[reply])
        self.calls = 0
        self.cancelled = 0

    async def complete(self, messages, **kwargs):  # type: ignore[override]
        self.calls += 1
        if self.calls == 1:
            return await super().complete(messages, **kwargs)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled += 1
            raise
        raise AssertionError("unreachable")


async def test_closing_the_stream_cancels_the_cases_still_being_judged():
    reply = json.dumps(
        {
            "groundedness": 5,
            "relevance": 5,
            "acknowledges_gap": False,
            "unsupported_claims": [],
            "reason": "ok",
        }
    )
    judge = HangingJudge(reply)
    cases = [case(f"budapest/c{n}") for n in range(3)]

    stream = jv.stream(cases, judge, concurrency=3)
    first = await anext(stream)
    await stream.aclose()
    await asyncio.sleep(0)

    assert isinstance(first, jv.Judged)
    assert judge.cancelled == 2
