"""Latency of each candidate, measured by the bench function inside AWS.

Cold numbers need a fresh execution environment: updating an environment variable
makes Lambda replace them, which is the documented way to force a cold start
without redeploying the image.
"""

import csv
import json
import logging
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any

from vector_store_bench import evalset

logger = logging.getLogger(__name__)
CANDIDATES = ("qdrant", "s3vectors")


@dataclass(frozen=True)
class Sample:
    candidate: str
    memory_mb: str
    phase: str  # cold | warm
    query_id: str
    embed_ms: float
    search_ms: float
    total_ms: float
    hits: list[str]


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, round(fraction * (len(ordered) - 1)))
    return ordered[index]


def invoke(client: Any, function_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload).encode(),
    )
    body = json.loads(response["Payload"].read())
    if "FunctionError" in response:
        raise RuntimeError(f"{function_name}: {body}")
    return body


def force_cold(client: Any, function_name: str) -> None:
    """Replace every execution environment by changing the configuration."""
    client.update_function_configuration(
        FunctionName=function_name,
        Environment={
            "Variables": _environment(client, function_name)
            | {"BENCH_NONCE": str(time.time())}
        },
    )
    waiter = client.get_waiter("function_updated_v2")
    waiter.wait(FunctionName=function_name)


def _environment(client: Any, function_name: str) -> dict[str, str]:
    configuration = client.get_function_configuration(FunctionName=function_name)
    return dict(configuration.get("Environment", {}).get("Variables", {}))


def measure(
    client: Any,
    function_name: str,
    memory_mb: str,
    queries: Sequence[evalset.EvalQuery],
    *,
    repeat: int,
    limit: int,
    candidates: Sequence[str] = CANDIDATES,
    store_function: str | None = None,
) -> list[Sample]:
    """`store_function` is the Qdrant function: a cold run has to start it cold
    too, otherwise the number is only the bench's own cold start."""
    samples: list[Sample] = []
    for candidate in candidates:
        logger.info("%s: cold run of %s", function_name, candidate)
        if candidate == "qdrant" and store_function:
            force_cold(client, store_function)
        force_cold(client, function_name)
        cold = invoke(
            client,
            function_name,
            {
                "candidate": candidate,
                "limit": limit,
                "queries": [{"id": queries[0].id, "query": queries[0].query}],
            },
        )
        samples += _samples(cold, candidate, memory_mb, "cold")

        logger.info(
            "%s: %d warm queries of %s", function_name, repeat * len(queries), candidate
        )
        warm = invoke(
            client,
            function_name,
            {
                "candidate": candidate,
                "limit": limit,
                "repeat": repeat,
                "queries": [{"id": q.id, "query": q.query} for q in queries],
            },
        )
        samples += _samples(warm, candidate, memory_mb, "warm")
    return samples


def _samples(
    response: dict[str, Any], candidate: str, memory_mb: str, phase: str
) -> list[Sample]:
    return [
        Sample(
            candidate=candidate,
            memory_mb=memory_mb,
            phase=phase if response.get("cold") or phase == "warm" else "warm",
            query_id=result["id"],
            embed_ms=result["embed_ms"],
            search_ms=result["search_ms"],
            total_ms=result["total_ms"],
            hits=result["hits"],
        )
        for result in response["results"]
    ]


def summarise(samples: Sequence[Sample]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    keys = sorted({(s.candidate, s.memory_mb, s.phase) for s in samples})
    for candidate, memory_mb, phase in keys:
        group = [
            s
            for s in samples
            if (s.candidate, s.memory_mb, s.phase) == (candidate, memory_mb, phase)
        ]
        search = [s.search_ms for s in group]
        rows.append(
            {
                "candidate": candidate,
                "memory_mb": memory_mb,
                "phase": phase,
                "samples": len(group),
                "embed_p50": round(median([s.embed_ms for s in group]), 1),
                "search_p50": round(median(search), 1),
                "search_p95": round(percentile(search, 0.95), 1),
                "total_p50": round(median([s.total_ms for s in group]), 1),
                "total_p95": round(percentile([s.total_ms for s in group], 0.95), 1),
            }
        )
    return rows


def write_csv(path: Path, samples: Sequence[Sample]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "candidate",
                "memory_mb",
                "phase",
                "query_id",
                "embed_ms",
                "search_ms",
                "total_ms",
                "hits",
            ]
        )
        for sample in samples:
            writer.writerow(
                [
                    sample.candidate,
                    sample.memory_mb,
                    sample.phase,
                    sample.query_id,
                    sample.embed_ms,
                    sample.search_ms,
                    sample.total_ms,
                    # JSON, not a space-joined list: doc_ids contain spaces
                    # ("Budapest/North Buda#do:..."), and splitting on those
                    # silently turned every hit into fragments.
                    json.dumps(sample.hits, ensure_ascii=False),
                ]
            )
