"""Recall@k and MRR of the deployed retriever over a fixed question set (TRA-263).

    uv run python tests/manual/retrieval_eval.py          # every city with a set
    uv run python tests/manual/retrieval_eval.py madrid
    just eval-retrieval madrid

Run by path, not as a module (see `planner_smoke.py`).

Each question of `questions/<city>.jsonl` goes through
`S3VectorsRetriever.search(query, limit=10, filters=RetrievalFilters(city=...))`:
the index, the Titan embedder and the city filter the planner searches with. A
question lists the `doc_id`s a good answer comes from (`expected`) and `why`.

Prints Markdown: recall@5, recall@10 and MRR overall, per city and per
language, then every question that left an expected id out of its top 10, with
the rank of each one. Expected ids the index no longer holds are listed first:
they still count as misses, so a corpus rebuild that renamed them shows here
instead of as a silent drop in recall.

Needs an AWS session (`just aws-login`, or `AWS_PROFILE`) and reads the index
`VECTOR_BUCKET` / `VECTOR_INDEX` name (production's by default). Not run in CI.
"""

import argparse
import asyncio
import json
import sys
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from statistics import fmean
from typing import TextIO

from ai_api.config import AISettings
from ai_api.domain.models import RetrievalFilters
from ai_api.domain.ports import Retriever
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.s3vectors_retriever import S3VectorsRetriever

QUESTIONS_DIR = Path(__file__).resolve().parent / "questions"
TOP_K = 10


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
    return sorted(path.stem for path in QUESTIONS_DIR.glob("*.jsonl"))


def load_questions(city: str) -> list[Question]:
    path = QUESTIONS_DIR / f"{city}.jsonl"
    with path.open(encoding="utf-8") as lines:
        rows = [json.loads(line) for line in lines if line.strip()]
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


async def evaluate(retriever: Retriever, questions: Sequence[Question]) -> list[Result]:
    """One search per question, in order, with the planner's city filter."""
    results: list[Result] = []
    for question in questions:
        documents = await retriever.search(
            question.query,
            limit=TOP_K,
            filters=RetrievalFilters(city=question.city),
        )
        results.append(Result(question, tuple(d.id for d in documents)))
    return results


async def missing_from_index(
    retriever: Retriever, questions: Sequence[Question]
) -> list[str]:
    """Expected ids the index does not hold, sorted."""
    expected = {doc_id for q in questions for doc_id in q.expected}
    held = {d.id for d in await retriever.fetch(sorted(expected))}
    return sorted(expected - held)


def _row(label: str, results: Sequence[Result]) -> str:
    return (
        f"| {label} | {len(results)} "
        f"| {fmean(r.recall(5) for r in results):.3f} "
        f"| {fmean(r.recall(10) for r in results):.3f} "
        f"| {fmean(r.reciprocal_rank for r in results):.3f} |"
    )


def _groups(
    results: Sequence[Result], key: Callable[[Result], str]
) -> Iterable[tuple[str, list[Result]]]:
    for value in sorted({key(r) for r in results}):
        yield value, [r for r in results if key(r) == value]


def report(results: Sequence[Result], missing: Sequence[str]) -> str:
    """The Markdown the script prints: totals, groups, then the misses."""
    lines = [
        "| Set | Questions | R@5 | R@10 | MRR |",
        "|---|---:|---:|---:|---:|",
        _row("**all**", results),
    ]
    for city, group in _groups(results, lambda r: r.question.city):
        lines.append(_row(city, group))
    for lang, group in _groups(results, lambda r: r.question.lang):
        lines.append(_row(f"lang `{lang}`", group))

    if missing:
        lines += ["", "Expected ids the index does not hold:", ""]
        lines += [f"- `{doc_id}`" for doc_id in missing]

    misses = [r for r in results if r.recall(TOP_K) < 1]
    lines += ["", f"Questions with an expected id outside the top {TOP_K}:", ""]
    if not misses:
        lines.append("- none")
    for result in misses:
        q = result.question
        ranks = ", ".join(
            f"`{doc_id}` "
            + (f"#{result.found.index(doc_id) + 1}" if doc_id in result.found else "—")
            for doc_id in q.expected
        )
        lines.append(f"- {q.city}/{q.id} ({q.lang}) “{q.query}”: {ranks}")
    return "\n".join(lines)


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/retrieval_eval.py",
        description="Recall@k and MRR of the deployed retriever (TRA-263).",
    )
    parser.add_argument(
        "city",
        nargs="?",
        choices=cities_with_questions(),
        help="one city's questions (default: every city with a set)",
    )
    return parser.parse_args(argv)


async def run(args: argparse.Namespace, out: TextIO) -> int:
    settings = AISettings()
    retriever = S3VectorsRetriever.from_settings(
        settings, TitanEmbedder.from_settings(settings)
    )
    cities = [args.city] if args.city else cities_with_questions()
    questions = [q for city in cities for q in load_questions(city)]
    missing = await missing_from_index(retriever, questions)
    results = await evaluate(retriever, questions)
    out.write(
        f"Retrieval eval {date.today().isoformat()} · index "
        f"`{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}` · embeddings "
        f"`{settings.EMBEDDINGS_MODEL}` · top {TOP_K}, city filter\n\n"
    )
    out.write(report(results, missing) + "\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
