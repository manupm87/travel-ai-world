"""`python -m city_corpus build <city> [--sources ...] [--offline]`,
`python -m city_corpus report <slug> [--no-gate]`,
`python -m city_corpus discover "<City name>"` and
`python -m city_corpus manifest` (rewrite `data/cities.json`)."""

import argparse
import json
import logging
import sys
from pathlib import Path

from city_corpus.build import ALL_STAGES, CorpusValidationError, Stage, collect, write
from city_corpus.config.cities import CITIES, CITIES_DIR
from city_corpus.discover import DiscoveryError, discover, summary, write_draft
from city_corpus.http import ApiClient, CacheMiss
from city_corpus.manifest import write_cities_manifest
from city_corpus.report import ReportError, write_report
from city_corpus.sources.tours import TourDataError

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE = PACKAGE_ROOT / ".cache"
DEFAULT_DATA = PACKAGE_ROOT / "data"

logger = logging.getLogger("city_corpus")


def _stages(value: str) -> tuple[Stage, ...]:
    try:
        return tuple(Stage(s.strip()) for s in value.split(",") if s.strip())
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="city_corpus")
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build", help="fetch sources and write the corpus")
    build.add_argument("city", choices=sorted(CITIES))
    build.add_argument(
        "--sources",
        type=_stages,
        default=ALL_STAGES,
        help=f"comma-separated: {','.join(ALL_STAGES)} (default: all)",
    )
    build.add_argument(
        "--offline", action="store_true", help="use only the cache; fail on a miss"
    )
    build.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    build.add_argument("--out-dir", type=Path, default=None)
    build.add_argument("-v", "--verbose", action="store_true")
    report = commands.add_parser(
        "report", help="readiness report over data/<slug>/documents.jsonl"
    )
    report.add_argument("city", help="slug of a folder under the data directory")
    report.add_argument(
        "--no-gate",
        action="store_true",
        help="write the report and exit 0 even below the thresholds",
    )
    report.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    report.add_argument("-v", "--verbose", action="store_true")
    draft = commands.add_parser(
        "discover", help="draft cities/<slug>.draft.toml for a city from open sources"
    )
    draft.add_argument("name", help='the city as Wikidata labels it, e.g. "Bologna"')
    draft.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    draft.add_argument("--out-dir", type=Path, default=CITIES_DIR)
    draft.add_argument("-v", "--verbose", action="store_true")
    cities = commands.add_parser(
        "manifest", help="rewrite data/cities.json from the built corpora"
    )
    cities.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    cities.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    if args.command == "report":
        return _report(args.city, args.data_dir, gate=not args.no_gate)
    if args.command == "discover":
        return _discover(args)
    if args.command == "manifest":
        path = write_cities_manifest(args.data_dir, CITIES)
        sys.stdout.write(f"{_manifest_summary(path)} → {path}\n")
        return 0
    return _build(args)


def _manifest_summary(path: Path) -> str:
    entries = json.loads(path.read_text(encoding="utf-8"))
    return ", ".join(f"{e['slug']} ({e['documents']})" for e in entries) or "no cities"


def _report(slug: str, data_dir: Path, *, gate: bool) -> int:
    try:
        summary, failures = write_report(data_dir, slug)
    except ReportError as exc:
        logger.error("%s", exc)
        return 1
    sys.stdout.write(
        f"{summary.documents} documents, {summary.located_sights} located sights, "
        f"{summary.located_eat} located eat, {summary.sleep} sleep, "
        f"{len(summary.districts)} districts, "
        f"{summary.pictured_sights_share:.0%} pictured sights → "
        f"{data_dir / slug / 'report.md'}\n"
    )
    for line in failures:
        sys.stdout.write(f"FAIL {line}\n")
    if failures and gate:
        sys.stdout.write("The corpus is not ready to index (--no-gate to ignore).\n")
        return 1
    return 0


def _build(args: argparse.Namespace) -> int:
    city = CITIES[args.city]
    out_dir = args.out_dir or DEFAULT_DATA / city.slug
    try:
        with ApiClient(args.cache_dir, offline=args.offline) as client:
            result = collect(city, client, args.sources)
        info = write(out_dir, city, result)
    except (CacheMiss, CorpusValidationError, TourDataError) as exc:
        logger.error("%s", exc)
        return 1

    sys.stdout.write(
        f"{info['documents']} documents ({info['listings']} listings, "
        f"{info['listings_with_coordinates']} with coordinates) → {out_dir}\n"
    )
    if info["districts_missing"]:
        sys.stdout.write(f"districts missing: {', '.join(info['districts_missing'])}\n")
    # The cities manifest lives beside the city folders (data/cities.json).
    manifest_path = write_cities_manifest(out_dir.parent, CITIES)
    sys.stdout.write(f"cities manifest: {_manifest_summary(manifest_path)}\n")
    return 0


def _discover(args: argparse.Namespace) -> int:
    try:
        with ApiClient(args.cache_dir) as client:
            found = discover(client, args.name)
    except DiscoveryError as exc:
        logger.error("%s", exc)
        return 1
    path = write_draft(found, args.out_dir)
    sys.stdout.write(f"{summary(found)}\n→ {path}\n")
    return 0
