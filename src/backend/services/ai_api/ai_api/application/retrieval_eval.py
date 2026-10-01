"""Recall@k and MRR of the retriever over a fixed question set (TRA-263, TRA-272).

Each city has 20 questions in `data/eval_questions/<city>.jsonl` (12 in English,
8 in Spanish, 3 of them Spanish twins of English ones with the same expected
ids). A question lists the `doc_id`s a good answer comes from (`expected`) and
`why` they were chosen. Every question goes through `Retriever.search` with the
city filter the planner uses and `limit=TOP_K`:

- **recall@k**: share of a question's expected ids in its first k results,
  averaged over the questions;
- **MRR**: mean of 1 / the rank of the first expected id (0 when none is found).

`run` returns a `Report`: the scores overall, per city and per language, the
questions that left an expected id out of their top `TOP_K` (with the rank of
each), and the expected ids the index does not hold (they count as misses, so a
corpus rebuild that renamed them shows up instead of a silent drop in recall).
Nothing is stored or traced. Used by `tests/manual/retrieval_eval.py` (from a
laptop) and the admin console (TRA-273).
"""

import asyncio
import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from importlib.resources import files
from statistics import fmean

from travel_common.exceptions import EntityNotFound

from ai_api.domain.models import RetrievalFilters
from ai_api.domain.ports import Retriever

TOP_K = 10
CONCURRENCY = 8
"""Searches in flight at once: 120 questions take seconds, well inside
Titan's and S3 Vectors' quotas."""

_QUESTIONS = files("ai_api") / "data" / "eval_questions"


@dataclass(frozen=True, slots=True)
class Question:
    city: str
    id: str
    lang: str
    query: str
    expected: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Result:
    question: Question
    found: tuple[str, ...]
    """The ids the retriever returned, best first."""

    def recall(self, k: int) -> float:
        return recall_at(self.found, self.question.expected, k)

    @property
    def reciprocal_rank(self) -> float:
        return reciprocal_rank(self.found, self.question.expected)

    def rank(self, doc_id: str) -> int | None:
        """1-based rank of `doc_id` among the results, None when absent."""
        return self.found.index(doc_id) + 1 if doc_id in self.found else None


@dataclass(frozen=True, slots=True)
class Scores:
    label: str
    """`all`, a city slug or a language code."""
    questions: int
    recall_at_5: float
    recall_at_10: float
    mrr: float


@dataclass(frozen=True, slots=True)
class Miss:
    question: Question
    ranks: tuple[int | None, ...]
    """The rank of each expected id, in `question.expected` order."""


@dataclass(frozen=True, slots=True)
class Report:
    overall: Scores
    by_city: list[Scores]
    by_language: list[Scores]
    misses: list[Miss]
    missing_from_index: list[str]


def recall_at(found: Sequence[str], expected: Sequence[str], k: int) -> float:
    """Share of the expected ids among the first `k` found."""
    if not expected:
        return 0.0
    return len(set(found[:k]) & set(expected)) / len(expected)


def reciprocal_rank(found: Sequence[str], expected: Sequence[str]) -> float:
    """1 / the rank of the first expected id found, 0 when there is none."""
    wanted = set(expected)
    for rank, doc_id in enumerate(found, start=1):
        if doc_id in wanted:
            return 1 / rank
    return 0.0


def cities_with_questions() -> list[str]:
    return sorted(
        entry.name.removesuffix(".jsonl")
        for entry in _QUESTIONS.iterdir()
        if entry.name.endswith(".jsonl")
    )


def load_questions(city: str) -> list[Question]:
    """`EntityNotFound` when the city has no question set."""
    if city not in cities_with_questions():
        raise EntityNotFound(f"No evaluation questions for {city!r}")
    lines = _QUESTIONS.joinpath(f"{city}.jsonl").read_text(encoding="utf-8")
    rows = [json.loads(line) for line in lines.splitlines() if line.strip()]
    return [
        Question(
            city=city,
            id=row["id"],
            lang=row["lang"],
            query=row["query"],
            expected=tuple(row["expected"]),
        )
        for row in rows
    ]


async def evaluate(
    retriever: Retriever,
    questions: Sequence[Question],
    *,
    concurrency: int = CONCURRENCY,
) -> list[Result]:
    """One search per question with the planner's city filter, `concurrency`
    at a time; the results keep the questions' order."""
    gate = asyncio.Semaphore(concurrency)

    async def one(question: Question) -> Result:
        async with gate:
            documents = await retriever.search(
                question.query,
                limit=TOP_K,
                filters=RetrievalFilters(city=question.city),
            )
        return Result(question, tuple(d.id for d in documents))

    return list(await asyncio.gather(*(one(q) for q in questions)))


async def missing_from_index(
    retriever: Retriever, questions: Sequence[Question]
) -> list[str]:
    """Expected ids the index does not hold, sorted."""
    expected = {doc_id for q in questions for doc_id in q.expected}
    held = {d.id for d in await retriever.fetch(sorted(expected))}
    return sorted(expected - held)


def _scores(label: str, results: Sequence[Result]) -> Scores:
    return Scores(
        label=label,
        questions=len(results),
        recall_at_5=fmean(r.recall(5) for r in results),
        recall_at_10=fmean(r.recall(10) for r in results),
        mrr=fmean(r.reciprocal_rank for r in results),
    )


def _by(results: Sequence[Result], key: Callable[[Result], str]) -> list[Scores]:
    return [
        _scores(value, [r for r in results if key(r) == value])
        for value in sorted({key(r) for r in results})
    ]


def summarize(results: Sequence[Result], missing: Sequence[str]) -> Report:
    return Report(
        overall=_scores("all", results),
        by_city=_by(results, lambda r: r.question.city),
        by_language=_by(results, lambda r: r.question.lang),
        misses=[
            Miss(r.question, tuple(r.rank(i) for i in r.question.expected))
            for r in results
            if r.recall(TOP_K) < 1
        ],
        missing_from_index=list(missing),
    )


async def run(retriever: Retriever, cities: Sequence[str]) -> Report:
    """Every question of `cities` against `retriever`."""
    questions = [q for city in cities for q in load_questions(city)]
    missing = await missing_from_index(retriever, questions)
    return summarize(await evaluate(retriever, questions), missing)


def to_markdown(report: Report) -> str:
    """The table the hand-run script prints: totals, groups, then the misses."""

    def row(label: str, s: Scores) -> str:
        return (
            f"| {label} | {s.questions} | {s.recall_at_5:.3f} "
            f"| {s.recall_at_10:.3f} | {s.mrr:.3f} |"
        )

    lines = [
        "| Set | Questions | R@5 | R@10 | MRR |",
        "|---|---:|---:|---:|---:|",
        row("**all**", report.overall),
        *(row(s.label, s) for s in report.by_city),
        *(row(f"lang `{s.label}`", s) for s in report.by_language),
    ]
    if report.missing_from_index:
        lines += ["", "Expected ids the index does not hold:", ""]
        lines += [f"- `{doc_id}`" for doc_id in report.missing_from_index]

    lines += ["", f"Questions with an expected id outside the top {TOP_K}:", ""]
    if not report.misses:
        lines.append("- none")
    for miss in report.misses:
        q = miss.question
        ranks = ", ".join(
            f"`{doc_id}` " + (f"#{rank}" if rank else "—")
            for doc_id, rank in zip(q.expected, miss.ranks, strict=True)
        )
        lines.append(f'- {q.city}/{q.id} ({q.lang}) "{q.query}": {ranks}')
    return "\n".join(lines)
