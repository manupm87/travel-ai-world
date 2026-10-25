"""Groundedness and relevance of the planner's answers, from a laptop.

    uv run python tests/manual/answer_eval.py                      # every city
    uv run python tests/manual/answer_eval.py madrid --per-city 5  # a cheap sample
    uv run python tests/manual/answer_eval.py --out answers.jsonl  # every verdict
    uv run python tests/manual/answer_eval.py --golden             # the judge alone
    just eval-answers madrid

Run by path, not as a module (see `planner_smoke.py`).

`ai_api.application.answer_eval` answers each question the way the planner's
chat does (the deployed index, the Bedrock chat model of `AISettings`, Haiku
4.5 by default) and has a judge model grade it (`--judge-model`, `JUDGE_MODEL`
by default: Amazon Nova Pro at `JUDGE_TEMPERATURE` 0). The full set is 120
answerable questions and 6 that no guide answers: two model calls each, a few
minutes and about 0.6 USD. `--out` writes every question, passage id, answer
and verdict as JSON lines, for a person to read the judge's work
(`--with-passages` adds the passages as the judge read them, what a golden
case freezes). `--golden` only runs the judge over the golden set
(`ai_api.application.judge_validation`) and prints how it agrees with the
labels: cents. The admin console runs the same two (ADR 0039). Needs an AWS
session (`just aws-login`, or `AWS_PROFILE`). Not run in CI.
"""

import argparse
import asyncio
import io
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import TextIO

from ai_api.application import answer_eval, judge_validation, retrieval_eval
from ai_api.config import AISettings
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.bedrock_provider import BedrockProvider
from ai_api.infrastructure.providers import build_judge_provider
from ai_api.infrastructure.s3vectors_retriever import S3VectorsRetriever
from ai_api.prompts import JUDGE_PROMPT, prompt_version


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/answer_eval.py",
        description="An LLM judge over the planner's answers.",
    )
    parser.add_argument(
        "city",
        nargs="?",
        choices=retrieval_eval.cities_with_questions(),
        help="one city's questions (default: every city)",
    )
    parser.add_argument(
        "--per-city",
        type=int,
        default=None,
        help="only the first N answerable questions of each city (a cheaper run)",
    )
    parser.add_argument(
        "--judge-model",
        default=None,
        help="Bedrock model id of the judge (default: JUDGE_MODEL)",
    )
    parser.add_argument(
        "--golden",
        action="store_true",
        help="only the judge, over the golden set, against its labels",
    )
    parser.add_argument(
        "--out", type=Path, default=None, help="write every graded answer here (JSONL)"
    )
    parser.add_argument(
        "--with-passages",
        action="store_true",
        help="with --out: also the passages as the judge read them",
    )
    return parser.parse_args(argv)


def _sample(
    items: list[answer_eval.Item], per_city: int | None
) -> list[answer_eval.Item]:
    if per_city is None:
        return items
    seen: dict[str, int] = {}
    kept = []
    for item in items:
        if item.answerable:
            seen[item.city] = seen.get(item.city, 0) + 1
            if seen[item.city] > per_city:
                continue
        kept.append(item)
    return kept


async def run(args: argparse.Namespace, out: TextIO) -> int:
    settings = AISettings()
    if args.judge_model:
        settings = settings.model_copy(update={"JUDGE_MODEL": args.judge_model})
    judge = build_judge_provider(settings)
    if args.golden:
        cases = judge_validation.load_cases()
        judged = [r async for r in judge_validation.stream(cases, judge)]
        out.write(
            f"Judge validation {date.today().isoformat()} · judge "
            f"`{settings.JUDGE_MODEL}` · judge prompt "
            f"`{prompt_version(JUDGE_PROMPT)}`\n\n"
        )
        report = judge_validation.summarize(judged)
        out.write(judge_validation.to_markdown(report) + "\n")
        return 0

    retriever = S3VectorsRetriever.from_settings(
        settings, TitanEmbedder.from_settings(settings)
    )
    answerer = BedrockProvider.from_settings(settings)
    cities = [args.city] if args.city else retrieval_eval.cities_with_questions()
    items = _sample(answer_eval.load_items(cities), args.per_city)
    results = await answer_eval.run(items, retriever, answerer, judge)

    if args.out:
        with args.out.open("w", encoding="utf-8") as lines:
            for result in results:
                row = _row(result, with_passages=args.with_passages)
                lines.write(json.dumps(row, ensure_ascii=False) + "\n")

    out.write(
        f"Answer eval {date.today().isoformat()} · answers "
        f"`{settings.BEDROCK_CHAT_MODEL}` · judge `{settings.JUDGE_MODEL}` · index "
        f"`{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}`, "
        f"{answer_eval.CHAT_PASSAGES} passages with the city filter\n\n"
    )
    out.write(answer_eval.to_markdown(answer_eval.summarize(results)) + "\n")
    return 0


def _row(
    result: answer_eval.Graded | answer_eval.Failure, *, with_passages: bool
) -> dict[str, object]:
    if isinstance(result, answer_eval.Failure):
        return {**asdict(result.item), "error": result.error}
    return {
        **asdict(result.item),
        "passages": list(result.passages),
        **({"context": result.context} if with_passages else {}),
        "answer": result.answer,
        "verdict": result.verdict.model_dump(),
    }


def main(argv: list[str] | None = None) -> int:
    # a Windows console's code page cannot print every answer (emoji, accents)
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
