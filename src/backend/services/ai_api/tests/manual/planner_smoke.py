"""A planner session against a real model, no AWS (TRA-169).

    uv run python tests/manual/planner_smoke.py --city budapest --lang es
    just planner-smoke budapest en

Run by path, not as a module: an installed distribution ships a top-level
`tests` package that would shadow this folder under `python -m`.

Drives `PlanTrip` the way the page does — the opening message, the dates, a
neighbourhood, a hotel, the alternatives of one slot, a restaurant request and
a question — with the NVIDIA model, a keyword retriever over the city's
committed `documents.jsonl`, the real Commons photo lookup and the real
Open-Meteo forecast. Prints a trimmed event log per turn and a summary:
activities per day, where each photo came from, repeated ids or titles, prices
that slipped into a card, seconds per turn.

Exit code 1 when an activity has no photo or a card carries a price, 2 when the
provider fails. Needs `NVIDIA_API_KEY` in `.env`; about a minute per run.
"""

import argparse
import asyncio
import json
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from ai_api.application.photos import ILLUSTRATIVE
from ai_api.application.plan_trip import PlanTrip
from ai_api.config import AISettings
from ai_api.domain.models import City, Document
from ai_api.infrastructure.cities import load_cities
from ai_api.infrastructure.commons_photos import CommonsPhotos
from ai_api.infrastructure.nvidia_provider import NvidiaProvider
from ai_api.infrastructure.open_meteo import OpenMeteoForecast
from ai_api.schemas.planner import PlannerTurn
from ai_api.schemas.planner_events import DAY_PARTS
from ai_api.testing import KeywordRetriever, city_for, documents_from_corpus
from travel_common.exceptions import DomainError

SERVICE_DIR = Path(__file__).resolve().parents[2]
CORPUS_DIR = SERVICE_DIR.parents[1] / "tools" / "city_corpus" / "data"
DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b"

PRICE = re.compile(r"[€$£]|\b(?:Ft|HUF|EUR|USD)\b")
"""A currency sign or code: a card must show tiers, never amounts."""

SOURCES = ("corpus", "commons", "illustrative", "none")
EXIT_FAILED, EXIT_PROVIDER = 1, 2

TEXTS: dict[str, dict[str, str]] = {
    "es": {
        "opening": (
            "Quiero {days} días en {city} desde {origin}, 2 adultos, presupuesto "
            "medio, gastronomía e historia"
        ),
        "dates": "Fechas: {start} · {end}",
        "alternatives": "Alternativas para el día 2 · tarde",
        "restaurant": "Un restaurante tradicional para la cena del día 1",
        "question": "¿Se puede pagar con tarjeta en el transporte público?",
    },
    "en": {
        "opening": (
            "I want {days} days in {city} from {origin}, 2 adults, mid budget, "
            "food and history"
        ),
        "dates": "Dates: {start} · {end}",
        "alternatives": "Alternatives for day 2 · afternoon",
        "restaurant": "A traditional restaurant for dinner on day 1",
        "question": "Can I pay by card on public transport?",
    },
}


@dataclass
class Tally:
    """What the session produced, for the summary and the exit code."""

    corpus_images: set[str]
    activities: dict[tuple[int, str], list[dict[str, Any]]] = field(
        default_factory=dict
    )
    stay: dict[str, Any] | None = None
    groups: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    turns: list[tuple[str, int, float]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    def source_of(self, card: dict[str, Any]) -> str:
        url, credit = card.get("image_url"), card.get("image_credit") or ""
        if not url:
            return "none"
        if url in self.corpus_images:
            return "corpus"
        if credit.startswith(ILLUSTRATIVE):
            return "illustrative"
        return "commons"

    def placed(self) -> list[dict[str, Any]]:
        return [card for cards in self.activities.values() for card in cards]

    def apply(self, event: dict[str, Any]) -> None:
        if event["type"] == "options":
            self.groups[event["group_id"]] = event["cards"]
        elif event["type"] == "itinerary_patch":
            for op in event["ops"]:
                self._apply_op(op)
        elif event["type"] == "error":
            self.errors.append(f"{event['error_code']}: {event['error']}")

    def _apply_op(self, op: dict[str, Any]) -> None:
        if op["op"] == "set_stay":
            self.stay = op["card"]
        elif op["op"] == "put_activity":
            key = (op["slot"]["day"], op["slot"]["part"])
            self.activities.setdefault(key, []).append(op["card"])
        elif op["op"] == "remove_activity":
            key = (op["slot"]["day"], op["slot"]["part"])
            self.activities[key] = [
                c for c in self.activities.get(key, []) if c["id"] != op["card_id"]
            ]

    def snapshot(self) -> dict[str, Any]:
        """The itinerary as the page would send it back."""
        days = max((day for day, _ in self.activities), default=0)
        return {
            "stay_card_id": self.stay["id"] if self.stay else None,
            "days": [
                {
                    "day": day,
                    "slots": {
                        part: [c["id"] for c in self.activities.get((day, part), [])]
                        for part in DAY_PARTS
                    },
                }
                for day in range(1, days + 1)
            ],
        }


def describe(event: dict[str, Any]) -> str:
    kind = event["type"]
    if kind == "brief":
        return f"  brief missing={event['missing']}"
    if kind == "options":
        cards = "; ".join(f"{c['title']} [{c['district']}]" for c in event["cards"])
        return f"  options {event['group_id']} ({event['kind']}): {cards}"
    if kind == "itinerary_patch":
        return "\n".join(_describe_op(op) for op in event["ops"])
    if kind in ("error", "done"):
        return f"  {json.dumps(event, ensure_ascii=False)}"
    return ""


def _describe_op(op: dict[str, Any]) -> str:
    if op["op"] == "put_activity":
        card, slot = op["card"], op["slot"]
        return (
            f"    put d{slot['day']} {slot['part']}: {card['title']} "
            f"[{card['category']}/{card['district']}] {card['why'][:80]!r}"
        )
    if op["op"] == "set_stay":
        return f"    stay: {op['card']['title']} (tier {op['card']['price_tier']})"
    return f"    {json.dumps(op, ensure_ascii=False)[:120]}"


class Session:
    def __init__(self, plan: PlanTrip, tally: Tally, *, out: Any, quiet: bool) -> None:
        self._plan = plan
        self._tally = tally
        self._out = out
        self._quiet = quiet
        self._brief: dict[str, Any] | None = None
        self._history: list[dict[str, str]] = []

    async def turn(
        self, message: str | None = None, action: dict[str, Any] | None = None
    ) -> None:
        request = PlannerTurn.model_validate(
            {
                "message": message,
                "action": action,
                "history": self._history,
                "brief": self._brief,
                "itinerary": self._tally.snapshot(),
                "trip_id": None,
            }
        )
        label = message or json.dumps(action, ensure_ascii=False)
        self._print(f"\n=== {label}")
        started = time.perf_counter()
        count = 0
        text: list[str] = []
        async for raw in self._plan(request):
            event = json.loads(raw.model_dump_json())
            count += 1
            if event["type"] == "text":
                text.append(event["delta"])
                continue
            self._flush(text)
            if event["type"] == "brief":
                self._brief = event["brief"]
            self._tally.apply(event)
            self._print(describe(event))
        self._flush(text)
        elapsed = time.perf_counter() - started
        self._tally.turns.append((label, count, elapsed))
        self._print(f"  ({elapsed:.1f}s, {count} events)")
        if message:
            self._history.append({"role": "user", "content": message})

    def _flush(self, text: list[str]) -> None:
        if text:
            joined = "".join(text)
            self._print(f"  text: {joined[:80]!r}{'…' if len(joined) > 80 else ''}")
            text.clear()

    def _print(self, line: str) -> None:
        if line and not self._quiet:
            self._out.write(line + "\n")
            self._out.flush()


def city_of(slug: str) -> City:
    """The manifest's entry for the slug (name, aliases), or a bare one for a
    city whose corpus is built but not yet in the manifest."""
    return next((c for c in load_cities() if c.slug == slug), None) or city_for(slug)


async def run(args: argparse.Namespace, out: Any) -> int:
    texts = TEXTS[args.lang]
    # Arguments beat the environment: the model named here is the one that runs.
    settings = AISettings(NVIDIA_CHAT_MODEL=args.model, LLM_PROVIDER="nvidia")
    provider = NvidiaProvider.from_settings(settings)
    if not provider.is_configured:
        out.write("NVIDIA_API_KEY is not set in the service's .env\n")
        return EXIT_PROVIDER
    corpus = args.corpus or CORPUS_DIR / args.city / "documents.jsonl"
    documents = documents_from_corpus(corpus)
    tally = Tally(corpus_images=corpus_image_urls(documents))
    photos = None if args.no_photos else CommonsPhotos.from_settings(settings)
    weather = OpenMeteoForecast.from_settings(settings)
    plan = PlanTrip(
        provider,
        KeywordRetriever(documents),
        weather=weather,
        photos=photos,
        cities=[city_of(args.city)],
    )
    session = Session(plan, tally, out=out, quiet=args.quiet)
    out.write(
        f"city={args.city} lang={args.lang} model={args.model} "
        f"documents={len(documents)} photos={'off' if args.no_photos else 'commons'}\n"
    )

    start = date.today() + timedelta(days=30)
    end = start + timedelta(days=args.days - 1)
    city = city_of(args.city).name
    try:
        await session.turn(
            texts["opening"].format(days=args.days, city=city, origin=args.origin)
        )
        # The brief may already be complete after the opening (then the
        # neighbourhoods came with it); otherwise the dates finish it. A turn
        # the provider dropped is retried once, the way a person would.
        for _ in range(2):
            if "nb" in tally.groups:
                break
            await session.turn(texts["dates"].format(start=start, end=end))
        await select_first(session, tally, "nb")
        hotels = next((g for g in tally.groups if g.startswith("hotels:")), None)
        if hotels:
            await select_first(session, tally, hotels)
        await session.turn(texts["alternatives"])
        await session.turn(texts["restaurant"])
        await session.turn(texts["question"])
    except DomainError as exc:
        out.write(f"\nprovider failed: {exc.error_code} {exc}\n")
        return EXIT_PROVIDER
    finally:
        await provider.aclose()
        await weather.aclose()
        if photos is not None:
            await photos.aclose()
    return summarise(tally, out)


async def select_first(session: Session, tally: Tally, group: str) -> None:
    cards = tally.groups.get(group)
    if cards:
        action = {"type": "select", "group_id": group, "card_ids": [cards[0]["id"]]}
        await session.turn(action=action)


def corpus_image_urls(documents: list[Document]) -> set[str]:
    urls: set[str] = set()
    for document in documents:
        extra = document.metadata.get("extra")
        if isinstance(extra, str):
            url = json.loads(extra).get("image_url")
            if isinstance(url, str):
                urls.add(url)
    return urls


def summarise(tally: Tally, out: Any) -> int:
    placed = tally.placed()
    days = sorted({day for day, _ in tally.activities})
    out.write("\n=== Summary\n")
    out.write("turn                                       events  seconds\n")
    for label, count, elapsed in tally.turns:
        out.write(f"{label[:40]:<40} {count:>8} {elapsed:>8.1f}\n")

    out.write("\nday  " + "  ".join(f"{p:<9}" for p in DAY_PARTS) + "\n")
    for day in days:
        cells = [len(tally.activities.get((day, part), [])) for part in DAY_PARTS]
        out.write(f"{day:<4} " + "  ".join(f"{c:<9}" for c in cells) + "\n")

    sources = Counter(tally.source_of(card) for card in placed)
    out.write("\nphoto source   activities\n")
    for source in SOURCES:
        out.write(f"{source:<14} {sources[source]}\n")
    if tally.stay:
        out.write(f"stay photo: {tally.source_of(tally.stay)}\n")

    ids = Counter(card["id"] for card in placed)
    titles = Counter(card["title"].strip().lower() for card in placed)
    duplicates = sorted(t for t, n in titles.items() if n > 1)
    cards = [*placed, *([tally.stay] if tally.stay else [])]
    priced = [
        card["title"]
        for card in cards
        if PRICE.search(card["why"]) or PRICE.search(card["title"])
    ]
    nb_photos = {c.get("image_url") for c in tally.groups.get("nb", [])} - {None}
    out.write(
        f"\nactivities: {len(placed)} · distinct ids: {len(ids)} · "
        f"duplicate titles: {len(duplicates)}"
        + (f" ({', '.join(duplicates)})" if duplicates else "")
        + "\n"
    )
    out.write(
        f"prices found: {len(priced)}"
        + (f" ({', '.join(priced)})" if priced else "")
        + "\n"
    )
    out.write(
        f"neighbourhood photos: {len(nb_photos)} distinct of "
        f"{len(tally.groups.get('nb', []))}"
        + ("" if len(nb_photos) >= 3 else " — WARNING: expected three different ones")
        + "\n"
    )
    for error in tally.errors:
        out.write(f"error event: {error}\n")

    failed = not placed or sources["none"] or priced or tally.errors
    out.write("RESULT: " + ("FAIL" if failed else "OK") + "\n")
    return EXIT_FAILED if failed else 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python tests/manual/planner_smoke.py",
        description="Run a planner session against the real model (no AWS).",
    )
    parser.add_argument("--city", default="budapest", help="corpus slug")
    parser.add_argument("--lang", choices=sorted(TEXTS), default="es")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="NVIDIA model id")
    parser.add_argument("--days", type=int, default=5)
    parser.add_argument("--origin", default="Madrid")
    parser.add_argument(
        "--corpus",
        type=Path,
        default=None,
        help="documents.jsonl (default: the city's)",
    )
    parser.add_argument(
        "--no-photos", action="store_true", help="skip the Commons lookup"
    )
    parser.add_argument(
        "--quiet", action="store_true", help="only the summary, no event log"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(run(parse_args(argv), sys.stdout))


if __name__ == "__main__":
    sys.exit(main())
