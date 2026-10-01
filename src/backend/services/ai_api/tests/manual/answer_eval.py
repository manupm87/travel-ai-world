"""Groundedness and relevance of the planner's answers, from a laptop (TRA-266).

    uv run python tests/manual/answer_eval.py                      # every city
    uv run python tests/manual/answer_eval.py madrid --per-city 5  # a cheap sample
    uv run python tests/manual/answer_eval.py --out answers.jsonl  # every verdict
    just eval-answers madrid

Run by path, not as a module (see `planner_smoke.py`).

`ai_api.application.answer_eval` answers each question the way the planner's
chat does (the deployed index, the Bedrock chat model of `AISettings`, Haiku
4.5 by default) and has a judge model grade it (`--judge-model`, Amazon Nova
Pro by default, temperature 0). The full set is 120 answerable questions and 6
that no guide answers: two model calls each, a few minutes and about 1 USD.
`--out` writes every question, passage id, answer and verdict as JSON lines,
for a person to read the judge's work. Needs an AWS session (`just
aws-login`, or `AWS_PROFILE`). Not run in CI.
"""

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path
from typing import TextIO

from ai_api.application import answer_eval, retrieval_eval
from ai_api.config import AISettings
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.bedrock_provider import BedrockProvider
from ai_api.infrastructure.s3vectors_retriever import S3VectorsRetriever


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/answer_eval.py",
        description="An LLM judge over the planner's answers (TRA-266).",
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
        default=answer_eval.JUDGE_MODEL,
        help=f"Bedrock model id of the judge (default {answer_eval.JUDGE_MODEL})",
    )
    parser.add_argument(
        "--out", type=Path, default=None, help="write every graded answer here (JSONL)"
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
    retriever = S3VectorsRetriever.from_settings(
        settings, TitanEmbedder.from_settings(settings)
    )
    answerer = BedrockProvider.from_settings(settings)
    judge = BedrockProvider.from_settings(
        settings.model_copy(
            update={"BEDROCK_CHAT_MODEL": args.judge_model, "CHAT_TEMPERATURE": 0.0}
        )
    )
    cities = [args.city] if args.city else retrieval_eval.cities_with_questions()
    items = _sample(answer_eval.load_items(cities), args.per_city)
    results = await answer_eval.run(items, retriever, answerer, judge)

    if args.out:
        with args.out.open("w", encoding="utf-8") as lines:
            for result in results:
                lines.write(json.dumps(_row(result), ensure_ascii=False) + "\n")

    out.write(
        f"Answer eval {date.today().isoformat()} · answers "
        f"`{settings.BEDROCK_CHAT_MODEL}` · judge `{args.judge_model}` · index "
        f"`{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}`, "
        f"{answer_eval.CHAT_PASSAGES} passages with the city filter\n\n"
    )
    out.write(answer_eval.to_markdown(answer_eval.summarize(results)) + "\n")
    return 0


def _row(result: answer_eval.Graded | answer_eval.Failure) -> dict[str, object]:
    if isinstance(result, answer_eval.Failure):
        return {**asdict(result.item), "error": result.error}
    return {
        **asdict(result.item),
        "passages": list(result.passages),
        "answer": result.answer,
        "verdict": result.verdict.model_dump(),
    }


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
