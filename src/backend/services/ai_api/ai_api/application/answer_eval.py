"""Groundedness and relevance of the planner's answers, graded by a second
model (TRA-266).

Each question of the retrieval set (`data/eval_questions/`, 20 per city) and of
`data/eval_unanswerable.jsonl` (one per city that no guide answers: a live
price, tonight's traffic, a wifi password) is answered the way the planner
answers a question in chat: the `CHAT_PASSAGES` passages `Retriever.search`
returns with the city filter, `plan_trip.chat_messages` with an empty
itinerary and no history, and the answer model. The judge model then reads the
question, the passages and the answer (`prompts.JUDGE_PROMPT`) and returns a
`Verdict`: groundedness and relevance from 1 to 5, whether the answer says the
information is not available, and the claims the passages do not support.

`summarize` gives the means over the answerable questions (overall, per city,
per language) and the share under 3 in either score, how many unanswerable
questions were acknowledged as such, which answerable ones were turned down
anyway, the worst answers, failures, and the tokens and cost of each model.
Nothing is stored or traced; `tests/manual/answer_eval.py` prints the report.
"""

import asyncio
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from importlib.resources import files
from statistics import fmean
from typing import cast

from pydantic import BaseModel, Field
from travel_common.exceptions import DomainError

from ai_api.application import retrieval_eval
from ai_api.application.language import Language
from ai_api.application.plan_trip import CHAT_PASSAGES, EMPTY_ITINERARY, chat_messages
from ai_api.application.pricing import estimate
from ai_api.application.structured import complete_json
from ai_api.domain.models import Message, RetrievalFilters, Usage
from ai_api.domain.ports import LLMProvider, Retriever
from ai_api.prompts import JUDGE_PROMPT, format_context, judge_request, prompt_version

JUDGE_MODEL = "eu.amazon.nova-pro-v1:0"
"""Amazon Nova Pro: another family than the answering Claude (no self-grading),
at a quarter of a Sonnet's price."""

CONCURRENCY = 4
"""Questions in flight at once: two model calls each."""

LOW = 3
"""An answer under this in either score counts as a bad one."""

WORST = 5

_UNANSWERABLE = files("ai_api") / "data" / "eval_unanswerable.jsonl"


@dataclass(frozen=True, slots=True)
class Item:
    city: str
    id: str
    lang: Language
    query: str
    answerable: bool


class Verdict(BaseModel):
    """What the judge returns for one answer."""

    groundedness: int = Field(
        ge=1, le=5, description="Are its claims supported by the passages? 1-5."
    )
    relevance: int = Field(ge=1, le=5, description="Does it answer the question? 1-5.")
    acknowledges_gap: bool = Field(
        description="It says the information is not available or cannot be confirmed."
    )
    unsupported_claims: list[str] = Field(
        description="Claims the passages do not support; empty when none."
    )
    reason: str = Field(description="One sentence explaining the scores.")


@dataclass(frozen=True, slots=True)
class Graded:
    item: Item
    passages: tuple[str, ...]
    """The ids of the passages the answer was given, best first."""
    answer: str
    verdict: Verdict
    answer_usage: Usage
    judge_usage: Usage

    @property
    def low(self) -> bool:
        return min(self.verdict.groundedness, self.verdict.relevance) < LOW


@dataclass(frozen=True, slots=True)
class Failure:
    item: Item
    error: str


@dataclass(frozen=True, slots=True)
class Means:
    label: str
    """`all`, a city slug or a language code."""
    answers: int
    groundedness: float
    relevance: float
    low_share: float


@dataclass(frozen=True, slots=True)
class Spend:
    model: str | None
    input_tokens: int
    output_tokens: int
    usd: float | None


@dataclass(frozen=True, slots=True)
class AnswerReport:
    overall: Means
    by_city: list[Means]
    by_language: list[Means]
    unanswerable: list[Graded]
    turned_down: list[Graded]
    """Answerable questions whose answer still said it could not tell."""
    worst: list[Graded]
    failures: list[Failure]
    answering: Spend
    judging: Spend
    judge_prompt: str
    """The version (`prompt_version`) of the judge prompt."""


def load_items(cities: Sequence[str]) -> list[Item]:
    """The retrieval questions of `cities`, then their unanswerable ones."""
    items = [
        Item(q.city, q.id, cast(Language, q.lang), q.query, answerable=True)
        for city in cities
        for q in retrieval_eval.load_questions(city)
    ]
    rows = [
        json.loads(line)
        for line in _UNANSWERABLE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    items += [
        Item(r["city"], r["id"], r["lang"], r["query"], answerable=False)
        for r in rows
        if r["city"] in cities
    ]
    return items


async def grade(
    item: Item, retriever: Retriever, answerer: LLMProvider, judge: LLMProvider
) -> Graded:
    """Answer `item` as the planner's chat does, then have it judged."""
    passages = await retriever.search(
        item.query, limit=CHAT_PASSAGES, filters=RetrievalFilters(city=item.city)
    )
    answer_usage = Usage()
    answer = await answerer.complete(
        chat_messages(item.lang, EMPTY_ITINERARY, passages, (), item.query),
        usage=answer_usage,
    )
    judge_usage = Usage()
    verdict = await complete_json(
        judge,
        [
            Message("system", JUDGE_PROMPT),
            Message(
                "user", judge_request(item.query, format_context(passages), answer)
            ),
        ],
        Verdict,
        name="judge",
        usage=judge_usage,
        template=JUDGE_PROMPT,
    )
    return Graded(
        item,
        tuple(d.id for d in passages),
        answer,
        verdict,
        answer_usage,
        judge_usage,
    )


async def run(
    items: Sequence[Item],
    retriever: Retriever,
    answerer: LLMProvider,
    judge: LLMProvider,
    *,
    concurrency: int = CONCURRENCY,
) -> list[Graded | Failure]:
    """Every item graded, `concurrency` at a time, in the items' order. A
    question whose answer or verdict fails is a `Failure`, not a lost run."""
    gate = asyncio.Semaphore(concurrency)

    async def one(item: Item) -> Graded | Failure:
        async with gate:
            try:
                return await grade(item, retriever, answerer, judge)
            except DomainError as exc:
                return Failure(item, exc.message)

    return list(await asyncio.gather(*(one(item) for item in items)))


def _means(label: str, graded: Sequence[Graded]) -> Means:
    return Means(
        label=label,
        answers=len(graded),
        groundedness=fmean(g.verdict.groundedness for g in graded),
        relevance=fmean(g.verdict.relevance for g in graded),
        low_share=sum(g.low for g in graded) / len(graded),
    )


def _by(graded: Sequence[Graded], key: Callable[[Graded], str]) -> list[Means]:
    return [
        _means(value, [g for g in graded if key(g) == value])
        for value in sorted({key(g) for g in graded})
    ]


def _spend(usages: Sequence[Usage]) -> Spend:
    model = next((u.model for u in usages if u.model), None)
    tokens_in = sum(u.input_tokens or 0 for u in usages)
    tokens_out = sum(u.output_tokens or 0 for u in usages)
    return Spend(
        model, tokens_in, tokens_out, estimate(model, tokens_in, tokens_out, None, 0)
    )


def summarize(results: Sequence[Graded | Failure]) -> AnswerReport:
    """`ValueError` when no answerable question was graded."""
    graded = [r for r in results if isinstance(r, Graded)]
    answerable = [g for g in graded if g.item.answerable]
    if not answerable:
        raise ValueError("no answerable question was graded")
    return AnswerReport(
        overall=_means("all", answerable),
        by_city=_by(answerable, lambda g: g.item.city),
        by_language=_by(answerable, lambda g: g.item.lang),
        unanswerable=[g for g in graded if not g.item.answerable],
        turned_down=[g for g in answerable if g.verdict.acknowledges_gap],
        worst=sorted(
            (g for g in answerable if g.low),
            key=lambda g: (g.verdict.groundedness + g.verdict.relevance, g.item.id),
        )[:WORST],
        failures=[r for r in results if isinstance(r, Failure)],
        answering=_spend([g.answer_usage for g in graded]),
        judging=_spend([g.judge_usage for g in graded]),
        judge_prompt=prompt_version(JUDGE_PROMPT),
    )


def _excerpt(text: str, size: int = 240) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= size else flat[: size - 1] + "…"


def _cost(spend: Spend) -> str:
    usd = "unknown price" if spend.usd is None else f"{spend.usd:.2f} USD"
    return (
        f"`{spend.model}`: {spend.input_tokens:,} tokens in, "
        f"{spend.output_tokens:,} out, {usd}"
    )


def to_markdown(report: AnswerReport) -> str:
    """The report the hand-run script prints."""

    def row(label: str, m: Means) -> str:
        return (
            f"| {label} | {m.answers} | {m.groundedness:.2f} | {m.relevance:.2f} "
            f"| {m.low_share:.0%} |"
        )

    lines = [
        f"Answerable questions (judge prompt `{report.judge_prompt}`):",
        "",
        f"| Set | Answers | Groundedness | Relevance | Under {LOW} |",
        "|---|---:|---:|---:|---:|",
        row("**all**", report.overall),
        *(row(m.label, m) for m in report.by_city),
        *(row(f"lang `{m.label}`", m) for m in report.by_language),
    ]

    acknowledged = sum(g.verdict.acknowledges_gap for g in report.unanswerable)
    lines += [
        "",
        f"Unanswerable questions: {acknowledged} of {len(report.unanswerable)} "
        "answers say the information is not available.",
        "",
    ]
    for g in report.unanswerable:
        mark = "yes" if g.verdict.acknowledges_gap else "**no**"
        lines.append(
            f"- {g.item.city}/{g.item.id} ({g.item.lang}) — acknowledged: {mark}, "
            f"G {g.verdict.groundedness} R {g.verdict.relevance}: "
            f'"{_excerpt(g.answer)}"'
        )

    lines += [
        "",
        f"Answerable questions turned down ({len(report.turned_down)}): "
        + (
            ", ".join(f"{g.item.city}/{g.item.id}" for g in report.turned_down)
            or "none"
        ),
        "",
        f"Worst answers (either score under {LOW}):",
        "",
    ]
    if not report.worst:
        lines.append("- none")
    for g in report.worst:
        claims = "; ".join(g.verdict.unsupported_claims) or "none listed"
        lines += [
            f"- {g.item.city}/{g.item.id} ({g.item.lang}) "
            f'"{g.item.query}" — G {g.verdict.groundedness} R {g.verdict.relevance}. '
            f"{g.verdict.reason}",
            f"  - unsupported: {claims}",
            f'  - answer: "{_excerpt(g.answer)}"',
        ]

    if report.failures:
        lines += ["", f"Failures ({len(report.failures)}):", ""]
        lines += [f"- {f.item.city}/{f.item.id}: {f.error}" for f in report.failures]

    lines += [
        "",
        f"Answering: {_cost(report.answering)}.",
        f"Judging: {_cost(report.judging)}.",
    ]
    return "\n".join(lines)
