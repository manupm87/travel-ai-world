"""`python -m vector_store_bench <command>` — the spike's reproducible commands."""

import argparse
import logging
import sys
from pathlib import Path

import numpy as np

from vector_store_bench import artifact, corpus, evalset, latency, quality
from vector_store_bench.embedder import TitanEmbedder
from vector_store_bench.stores.qdrant_store import QdrantStore

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = (
    PACKAGE_ROOT.parent / "city_corpus" / "data" / "budapest" / "documents.jsonl"
)
DEFAULT_ARTIFACTS = PACKAGE_ROOT / ".artifacts" / "budapest"

logger = logging.getLogger("vector_store_bench")


def embed(args: argparse.Namespace) -> int:
    documents = corpus.load(args.corpus)
    if args.limit:
        documents = documents[: args.limit]
    logger.info("embedding %d documents with Titan V2", len(documents))
    embedder = TitanEmbedder(concurrency=args.concurrency)
    vectors = embedder.embed_documents([d.text for d in documents])
    manifest = artifact.write(
        args.out,
        [d.doc_id for d in documents],
        vectors,
        corpus=args.corpus,
        tokens=embedder.stats.tokens,
    )
    sys.stdout.write(
        f"{manifest['documents']} vectors → {args.out}\n"
        f"{embedder.stats.tokens} input tokens, about ${embedder.stats.usd:.3f}, "
        f"{embedder.stats.seconds:.0f}s of Bedrock time\n"
    )
    return 0


def measure_quality(args: argparse.Namespace) -> int:
    documents = corpus.load(args.corpus)
    embeddings = artifact.read(args.artifacts)
    queries = evalset.load()
    logger.info("embedding %d evaluation queries", len(queries))
    embedder = TitanEmbedder()
    vectors = quality.embed_queries(queries, embedder.embed_query)

    by_id = {d.doc_id: d for d in documents}
    store = QdrantStore.in_memory()
    store.create(embeddings.vectors.shape[1])
    store.index(
        embeddings.doc_ids,
        embeddings.vectors,
        [by_id[i].filterable() | {"doc_id": i} for i in embeddings.doc_ids],
    )
    store.build_keyword_index(
        embeddings.doc_ids,
        [f"{by_id[i].name or ''} {by_id[i].text}" for i in embeddings.doc_ids],
    )
    logger.info("qdrant (in process) holds %d points", len(embeddings.doc_ids))

    runs = quality.run_strategies(
        documents,
        embeddings,
        queries,
        vectors,
        stores={
            "qdrant dense": lambda vector, _text, k: store.search(vector, k),
            "qdrant dense + BM25 (RRF)": lambda vector, text, k: store.search_hybrid(
                vector, text, k
            ),
        },
    )
    quality.write_csv(args.csv, runs)
    sys.stdout.write(quality.as_table(runs) + f"\n\nCSV → {args.csv}\n")
    np.save(
        args.artifacts / "query_vectors.npy",
        np.vstack([vectors[q.id] for q in queries]),
    )
    return 0


def measure_latency(args: argparse.Namespace) -> int:
    import boto3

    client = boto3.client("lambda", region_name=args.region)
    queries = evalset.load()
    samples: list[latency.Sample] = []
    for size in args.sizes.split(","):
        function_name = args.function.format(size=size.strip())
        samples += latency.measure(
            client,
            function_name,
            size.strip(),
            queries,
            repeat=args.repeat,
            limit=args.limit,
        )
    latency.write_csv(args.csv, samples)
    rows = latency.summarise(samples)
    headers = list(rows[0])
    widths = [max(len(h), *(len(str(r[h])) for r in rows)) for h in headers]
    lines = ["  ".join(h.ljust(w) for h, w in zip(headers, widths, strict=True))]
    lines += [
        "  ".join(str(r[h]).ljust(w) for h, w in zip(headers, widths, strict=True))
        for r in rows
    ]
    sys.stdout.write("\n".join(lines) + f"\n\nCSV → {args.csv}\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vector_store_bench")
    parser.add_argument("-v", "--verbose", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)

    embedding = commands.add_parser(
        "embed", help="embed the corpus once, for both stores"
    )
    embedding.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    embedding.add_argument("--out", type=Path, default=DEFAULT_ARTIFACTS)
    embedding.add_argument(
        "--limit", type=int, default=0, help="first N documents only"
    )
    embedding.add_argument("--concurrency", type=int, default=8)
    embedding.set_defaults(handler=embed)

    measure = commands.add_parser("quality", help="recall and MRR per strategy")
    measure.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    measure.add_argument("--artifacts", type=Path, default=DEFAULT_ARTIFACTS)
    measure.add_argument(
        "--csv", type=Path, default=PACKAGE_ROOT / "results" / "quality.csv"
    )
    measure.set_defaults(handler=measure_quality)

    timing = commands.add_parser("latency", help="time both candidates from AWS")
    timing.add_argument(
        "--sizes", default="1024,2048", help="Qdrant memory sizes to use"
    )
    timing.add_argument(
        "--function",
        default="travel-ai-spike-vs-bench-{size}",
        help="bench function name",
    )
    timing.add_argument("--region", default="eu-west-1")
    timing.add_argument(
        "--repeat", type=int, default=4, help="passes over the eval set"
    )
    timing.add_argument("--limit", type=int, default=10)
    timing.add_argument(
        "--csv", type=Path, default=PACKAGE_ROOT / "results" / "latency.csv"
    )
    timing.set_defaults(handler=measure_latency)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    handler: object = args.handler
    return int(handler(args))  # type: ignore[operator]
