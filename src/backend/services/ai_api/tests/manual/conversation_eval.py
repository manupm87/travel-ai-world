"""Scripted conversations against the real planner, from a laptop (TRA-288).

    uv run python tests/manual/conversation_eval.py                 # every scenario
    uv run python tests/manual/conversation_eval.py budapest --tag safety
    uv run python tests/manual/conversation_eval.py --scenario prices-en --repeat 3
    just eval-conversations --repeat 3 --concurrency 1     # the gate (ADR 0032)
    just eval-conversations budapest --judge --out eval.md

Run by path, not as a module (see `planner_smoke.py`).

`ai_api.application.conversation_eval` plays each scenario of
`ai_api/data/eval_conversations/<city>/` against `PlanTrip`, playing the page's
side too, and checks the itinerary and the texts it leaves. The planner runs
as `planner_smoke.py` builds it: the provider of the settings
(`providers.build_llm_provider`: NVIDIA with `NVIDIA_API_KEY` locally, or
Bedrock with `LLM_PROVIDER=bedrock` after `just aws-login`), a
`KeywordRetriever` over the city's committed `documents.jsonl`, the real
Open-Meteo forecast; Commons photos and site previews only with `--photos`.
The input guard is `providers.build_input_guard`'s: the Bedrock Guardrail when
`BEDROCK_GUARDRAIL_ID` is set (TRA-292), else none.
`--judge` adds an LLM verdict per run (`--judge-model`, the same provider).

Prints the Markdown report (`--out` also writes it, and the transcripts as JSON
next to it). Exit code 1 when a safety check failed, 2 when the provider is not
configured. Not run in CI.
"""

import argparse
import asyncio
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import TextIO

from ai_api.application import conversation_eval as ev
from ai_api.application.plan_trip import PlanTrip
from ai_api.config import AISettings
from ai_api.domain.models import City
from ai_api.domain.ports import Retriever
from ai_api.infrastructure.cities import load_cities
from ai_api.infrastructure.commons_photos import CommonsPhotos
from ai_api.infrastructure.open_meteo import OpenMeteoForecast
from ai_api.infrastructure.providers import build_input_guard, build_llm_provider
from ai_api.infrastructure.site_previews import SitePreviews
from ai_api.testing import KeywordRetriever, city_for, documents_from_corpus

SERVICE_DIR = Path(__file__).resolve().parents[2]
CORPUS_DIR = SERVICE_DIR.parents[1] / "tools" / "city_corpus" / "data"
EXIT_SAFETY, EXIT_PROVIDER = 1, 2


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/conversation_eval.py",
        description="Scripted conversations against the planner (TRA-288).",
    )
    parser.add_argument(
        "city",
        nargs="?",
        choices=ev.scenario_cities(),
        help="one city's scenarios (default: every city)",
    )
    parser.add_argument(
        "--scenario",
        action="append",
        default=[],
        help="only this scenario id (repeatable)",
    )
    parser.add_argument(
        "--tag", action="append", default=[], help="only scenarios with this tag"
    )
    parser.add_argument(
        "--repeat", type=int, default=1, help="runs per scenario (the gate uses 3)"
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=ev.CONCURRENCY,
        help="scenario runs in flight at once (the gate uses 1: no rate limits "
        "in the measurement)",
    )
    parser.add_argument(
        "--judge", action="store_true", help="an LLM verdict on each conversation"
    )
    parser.add_argument(
        "--judge-model",
        default=None,
        help="model id of the judge (default: the planner's model)",
    )
    parser.add_argument(
        "--photos",
        action="store_true",
        help="real Commons photos and site previews (off by default)",
    )
    parser.add_argument(
        "--out", type=Path, default=None, help="also write the report here (.md)"
    )
    return parser.parse_args(argv)


def git_sha() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            cwd=SERVICE_DIR,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return result.stdout.strip()


def city_of(slug: str, cities: tuple[City, ...]) -> City:
    return next((c for c in cities if c.slug == slug), None) or city_for(slug)


def judge_settings(settings: AISettings, model: str | None) -> AISettings:
    update: dict[str, object] = {"CHAT_TEMPERATURE": 0.0}
    if model:
        key = (
            "BEDROCK_CHAT_MODEL"
            if settings.LLM_PROVIDER == "bedrock"
            else "NVIDIA_CHAT_MODEL"
        )
        update[key] = model
    return settings.model_copy(update=update)


def model_of(settings: AISettings) -> str:
    if settings.LLM_PROVIDER == "bedrock":
        return f"bedrock `{settings.BEDROCK_CHAT_MODEL}`"
    return f"nvidia `{settings.NVIDIA_CHAT_MODEL}`"


async def run(args: argparse.Namespace, out: TextIO) -> int:
    settings = AISettings()
    provider = build_llm_provider(settings)
    if not provider.is_configured:
        out.write(f"The {settings.LLM_PROVIDER} provider is not configured\n")
        return EXIT_PROVIDER
    judge = (
        build_llm_provider(judge_settings(settings, args.judge_model))
        if args.judge
        else None
    )
    scenarios = ev.select_scenarios(
        ev.load_scenarios([args.city] if args.city else None),
        ids=args.scenario,
        tags=args.tag,
    )
    if not scenarios:
        out.write("No scenario matches\n")
        return 0
    manifest = load_cities()
    weather = OpenMeteoForecast.from_settings(settings)
    photos = CommonsPhotos.from_settings(settings) if args.photos else None
    previews = SitePreviews.from_settings(settings) if args.photos else None
    guard = build_input_guard(settings)
    retrievers: dict[str, Retriever] = {}
    planners: dict[str, PlanTrip] = {}

    def retriever_for(slug: str) -> Retriever:
        if slug not in retrievers:
            documents = documents_from_corpus(CORPUS_DIR / slug / "documents.jsonl")
            retrievers[slug] = KeywordRetriever(documents)
        return retrievers[slug]

    def planner_for(slug: str) -> PlanTrip:
        if slug not in planners:
            planners[slug] = PlanTrip(
                provider,
                retriever_for(slug),
                weather=weather,
                photos=photos,
                previews=previews,
                cities=[city_of(slug, manifest)],
                agent_max_steps=settings.AGENT_MAX_STEPS,
                agent_max_tool_calls=settings.AGENT_MAX_TOOL_CALLS,
                guard=guard,
            )
        return planners[slug]

    names = {s.city: city_of(s.city, manifest).name for s in scenarios}
    try:
        report = await ev.run(
            scenarios,
            planner_for,
            retriever_for,
            city_names=names,
            repeat=args.repeat,
            concurrency=max(1, args.concurrency),
            judge=judge,
        )
    finally:
        await provider.aclose()
        await weather.aclose()
        if judge is not None:
            await judge.aclose()
        if photos is not None:
            await photos.aclose()
        if previews is not None:
            await previews.aclose()

    judged = (
        f" · judge {model_of(judge_settings(settings, args.judge_model))}"
        if args.judge
        else ""
    )
    text = (
        f"Conversation eval {date.today().isoformat()} · planner "
        f"{model_of(settings)}{judged} · git `{git_sha()}` · "
        f"{len(scenarios)} scenarios, {args.repeat} run(s) each · photos "
        f"{'on' if args.photos else 'off'}\n\n" + ev.to_markdown(report) + "\n"
    )
    out.write(text)
    if args.out:
        args.out.write_text(text, encoding="utf-8")
        args.out.with_suffix(".json").write_text(
            ev.report_json(report), encoding="utf-8"
        )
    return EXIT_SAFETY if ev.safety_failed(report) else 0


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
