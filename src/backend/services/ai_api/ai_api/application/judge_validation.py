"""How far the answer judge agrees with labelled verdicts: the golden set.

Each case of `data/eval_judge_golden.jsonl` freezes a question, the passages the
answer was given (as the judge reads them), the answer and the verdict a careful
reader gives it under the judge's rubric. Some answers are real ones of the
production model; others carry a defect put in on purpose (an invented price, a
wrong currency, a false "I don't know") so the scores are not all fives. Only the
judge is called, so a run is cheap and repeatable.
"""

import asyncio
import json
from collections.abc import AsyncGenerator, Sequence
from contextlib import aclosing
from dataclasses import dataclass
from importlib.resources import files
from statistics import fmean
from typing import Literal, cast

from travel_common.exceptions import DomainError

from ai_api.application.answer_eval import (
    CONCURRENCY,
    LOW,
    Spend,
    Verdict,
    as_finished,
    spend,
)
from ai_api.application.language import Language
from ai_api.application.structured import complete_json
from ai_api.domain.models import Message, Usage
from ai_api.domain.ports import LLMProvider
from ai_api.prompts import JUDGE_PROMPT, judge_request

Origin = Literal["real", "perturbed"]

SCORES = (1, 2, 3, 4, 5)

_GOLDEN = files("ai_api") / "data" / "eval_judge_golden.jsonl"


@dataclass(frozen=True, slots=True)
class Expected:
    groundedness: int
    relevance: int
    acknowledges_gap: bool

    @property
    def low(self) -> bool:
        return min(self.groundedness, self.relevance) < LOW


@dataclass(frozen=True, slots=True)
class Case:
    id: str
    """`<city>/<question id>`, with a `~<defect>` suffix on a perturbed copy."""
    city: str
    lang: Language
    query: str
    answerable: bool
    passages: tuple[str, ...]
    context: str
    """The passages exactly as the judge reads them (`prompts.format_context`)."""
    answer: str
    origin: Origin
    defect: str | None
    expected: Expected
    why: str


@dataclass(frozen=True, slots=True)
class Judged:
    case: Case
    verdict: Verdict
    usage: Usage

    @property
    def low(self) -> bool:
        return min(self.verdict.groundedness, self.verdict.relevance) < LOW

    @property
    def gap(self) -> int:
        """The largest distance between the judge's score and the expected one."""
        return max(
            abs(self.verdict.groundedness - self.case.expected.groundedness),
            abs(self.verdict.relevance - self.case.expected.relevance),
        )

    @property
    def agrees(self) -> bool:
        return (
            self.gap == 0
            and self.verdict.acknowledges_gap == self.case.expected.acknowledges_gap
        )


@dataclass(frozen=True, slots=True)
class CaseFailure:
    case: Case
    error: str


@dataclass(frozen=True, slots=True)
class ScoreAgreement:
    score: str
    exact: float
    within_one: float
    kappa: float | None
    """Cohen's kappa with quadratic weights; `None` when both raters gave one same label."""
    confusion: list[list[int]]
    """Rows: the expected score 1-5; columns: the judge's."""
    mean_expected: float
    mean_judge: float


@dataclass(frozen=True, slots=True)
class AgreementReport:
    cases: int
    failures: list[CaseFailure]
    groundedness: ScoreAgreement
    relevance: ScoreAgreement
    low_kappa: float | None
    """Cohen's kappa of "either score under `LOW`", the report's bad-answer line."""
    low_agreement: float
    gap_accuracy: float
    exact_real: float | None
    exact_perturbed: float | None
    """Share of cases with both scores and the gap flag as expected, by origin."""
    disagreements: list[Judged]
    """Cases the judge did not grade as expected, widest gap first."""
    judging: Spend


def load_cases() -> list[Case]:
    rows = [
        json.loads(line)
        for line in _GOLDEN.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    return [
        Case(
            id=r["id"],
            city=r["city"],
            lang=cast(Language, r["lang"]),
            query=r["query"],
            answerable=r["answerable"],
            passages=tuple(r["passages"]),
            context=r["context"],
            answer=r["answer"],
            origin=r["origin"],
            defect=r["defect"],
            expected=Expected(**r["expected"]),
            why=r["why"],
        )
        for r in rows
    ]


async def judge_case(case: Case, judge: LLMProvider) -> Judged:
    usage = Usage()
    verdict = await complete_json(
        judge,
        [
            Message("system", JUDGE_PROMPT),
            Message("user", judge_request(case.query, case.context, case.answer)),
        ],
        Verdict,
        name="judge",
        usage=usage,
        template=JUDGE_PROMPT,
    )
    return Judged(case, verdict, usage)


async def stream(
    cases: Sequence[Case], judge: LLMProvider, *, concurrency: int = CONCURRENCY
) -> AsyncGenerator[Judged | CaseFailure]:
    """Every case judged, `concurrency` at a time, each as soon as it is done."""
    gate = asyncio.Semaphore(concurrency)

    async def one(case: Case) -> Judged | CaseFailure:
        async with gate:
            try:
                return await judge_case(case, judge)
            except DomainError as exc:
                return CaseFailure(case, exc.message)

    async with aclosing(as_finished(one(case) for case in cases)) as results:
        async for result in results:
            yield result


def cohen_kappa(
    expected: Sequence[int],
    judged: Sequence[int],
    categories: Sequence[int],
    *,
    quadratic: bool = False,
) -> float | None:
    """Cohen's kappa of two raters over `categories`, unweighted or quadratic.

    `None` when chance agreement is total (both raters always gave one label),
    where kappa is undefined.
    """
    k = len(categories)
    index = {c: i for i, c in enumerate(categories)}
    n = len(expected)
    observed = [[0.0] * k for _ in range(k)]
    for a, b in zip(expected, judged, strict=True):
        observed[index[a]][index[b]] += 1 / n
    rows = [sum(row) for row in observed]
    cols = [sum(observed[i][j] for i in range(k)) for j in range(k)]

    def weight(i: int, j: int) -> float:
        if quadratic:
            return (i - j) ** 2 / (k - 1) ** 2
        return 0.0 if i == j else 1.0

    disagreement = sum(
        weight(i, j) * observed[i][j] for i in range(k) for j in range(k)
    )
    chance = sum(weight(i, j) * rows[i] * cols[j] for i in range(k) for j in range(k))
    if chance == 0:
        return None
    return 1 - disagreement / chance


def _score(name: str, judged: Sequence[Judged]) -> ScoreAgreement:
    expected = [getattr(j.case.expected, name) for j in judged]
    given = [getattr(j.verdict, name) for j in judged]
    confusion = [[0] * len(SCORES) for _ in SCORES]
    for a, b in zip(expected, given, strict=True):
        confusion[a - 1][b - 1] += 1
    return ScoreAgreement(
        score=name,
        exact=fmean(a == b for a, b in zip(expected, given, strict=True)),
        within_one=fmean(abs(a - b) <= 1 for a, b in zip(expected, given, strict=True)),
        kappa=cohen_kappa(expected, given, SCORES, quadratic=True),
        confusion=confusion,
        mean_expected=fmean(expected),
        mean_judge=fmean(given),
    )


def _exact(judged: Sequence[Judged]) -> float | None:
    return fmean(j.agrees for j in judged) if judged else None


def summarize(results: Sequence[Judged | CaseFailure]) -> AgreementReport:
    """Aggregate the judged cases into a report.

    Raises:
        ValueError: no case was judged.
    """
    judged = [r for r in results if isinstance(r, Judged)]
    if not judged:
        raise ValueError("no golden case was judged")
    return AgreementReport(
        cases=len(judged),
        failures=[r for r in results if isinstance(r, CaseFailure)],
        groundedness=_score("groundedness", judged),
        relevance=_score("relevance", judged),
        low_kappa=cohen_kappa(
            [int(j.case.expected.low) for j in judged],
            [int(j.low) for j in judged],
            (0, 1),
        ),
        low_agreement=fmean(j.low == j.case.expected.low for j in judged),
        gap_accuracy=fmean(
            j.verdict.acknowledges_gap == j.case.expected.acknowledges_gap
            for j in judged
        ),
        exact_real=_exact([j for j in judged if j.case.origin == "real"]),
        exact_perturbed=_exact([j for j in judged if j.case.origin == "perturbed"]),
        disagreements=sorted(
            (j for j in judged if not j.agrees), key=lambda j: (-j.gap, j.case.id)
        ),
        judging=spend([j.usage for j in judged]),
    )


def _share(value: float | None) -> str:
    return "—" if value is None else f"{value:.0%}"


def _kappa(value: float | None) -> str:
    return "undefined" if value is None else f"{value:.2f}"


def to_markdown(report: AgreementReport) -> str:
    """The report the hand-run script prints."""

    def row(s: ScoreAgreement) -> str:
        return (
            f"| {s.score} | {s.exact:.0%} | {s.within_one:.0%} | {_kappa(s.kappa)} "
            f"| {s.mean_expected:.2f} | {s.mean_judge:.2f} |"
        )

    lines = [
        f"Golden set: {report.cases} cases judged, {len(report.failures)} failed.",
        "",
        "| Score | Exact | Within 1 | Kappa (quadratic) | Mean expected | Mean judge |",
        "|---|---:|---:|---:|---:|---:|",
        row(report.groundedness),
        row(report.relevance),
        "",
        f"Either score under {LOW}: agreement {report.low_agreement:.0%}, "
        f"kappa {_kappa(report.low_kappa)}.",
        f"acknowledges_gap as expected: {report.gap_accuracy:.0%}.",
        f"Every field as expected: real answers {_share(report.exact_real)}, "
        f"perturbed ones {_share(report.exact_perturbed)}.",
        "",
        f"Disagreements ({len(report.disagreements)}):",
        "",
    ]
    if not report.disagreements:
        lines.append("- none")
    for j in report.disagreements:
        e, v = j.case.expected, j.verdict
        lines.append(
            f"- {j.case.id}: expected G {e.groundedness} R {e.relevance} "
            f"gap {e.acknowledges_gap}, judge G {v.groundedness} R {v.relevance} "
            f"gap {v.acknowledges_gap}. {v.reason}"
        )
    lines += [f"- failed {f.case.id}: {f.error}" for f in report.failures]
    usd = (
        "unknown price"
        if report.judging.usd is None
        else f"{report.judging.usd:.2f} USD"
    )
    lines += [
        "",
        f"Judging: `{report.judging.model}`: {report.judging.input_tokens:,} tokens "
        f"in, {report.judging.output_tokens:,} out, {usd}.",
    ]
    return "\n".join(lines)
