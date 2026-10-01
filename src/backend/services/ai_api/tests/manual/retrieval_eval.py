"""Recall@k and MRR of the deployed index, from a laptop (TRA-263, TRA-272).

    uv run python tests/manual/retrieval_eval.py          # every city
    uv run python tests/manual/retrieval_eval.py madrid
    just eval-retrieval madrid

Run by path, not as a module (see `planner_smoke.py`).

The questions, the runner and the metrics are `ai_api.application.retrieval_eval`
(the admin console runs the same, TRA-273); this prints its report as Markdown.
Needs an AWS session (`just aws-login`, or `AWS_PROFILE`) and reads the index
`VECTOR_BUCKET` / `VECTOR_INDEX` name (production's by default). Not run in CI.
"""

import argparse
import asyncio
import sys
from datetime import date
from typing import TextIO

from ai_api.application import retrieval_eval
from ai_api.config import AISettings
from ai_api.infrastructure.bedrock_embedder import TitanEmbedder
from ai_api.infrastructure.s3vectors_retriever import S3VectorsRetriever


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/retrieval_eval.py",
        description="Recall@k and MRR of the deployed retriever (TRA-263).",
    )
    parser.add_argument(
        "city",
        nargs="?",
        choices=retrieval_eval.cities_with_questions(),
        help="one city's questions (default: every city)",
    )
    return parser.parse_args(argv)


async def run(args: argparse.Namespace, out: TextIO) -> int:
    settings = AISettings()
    retriever = S3VectorsRetriever.from_settings(
        settings, TitanEmbedder.from_settings(settings)
    )
    cities = [args.city] if args.city else retrieval_eval.cities_with_questions()
    report = await retrieval_eval.run(retriever, cities)
    out.write(
        f"Retrieval eval {date.today().isoformat()} · index "
        f"`{settings.VECTOR_BUCKET}/{settings.VECTOR_INDEX}` · embeddings "
        f"`{settings.EMBEDDINGS_MODEL}` · top {retrieval_eval.TOP_K}, city filter\n\n"
    )
    out.write(retrieval_eval.to_markdown(report) + "\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
