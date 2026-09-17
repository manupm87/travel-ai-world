"""`python -m city_corpus build <city> [--sources ...] [--offline]`."""

import argparse
import logging
import sys
from pathlib import Path

from city_corpus.build import ALL_STAGES, CorpusValidationError, Stage, collect, write
from city_corpus.config.cities import CITIES
from city_corpus.http import ApiClient, CacheMiss
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
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
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
    return 0
