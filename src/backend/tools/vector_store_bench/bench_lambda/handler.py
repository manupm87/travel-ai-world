"""The bench function: one place that times both candidates the same way.

It runs where `ai_api` runs (same Region, outside any VPC, one request per
execution environment), so the numbers include the network path a real answer
would pay and exclude everything the chat adds on top.

Event:
    {"candidate": "qdrant" | "s3vectors",
     "queries": [{"id": "...", "query": "..."}],
     "repeat": 1, "limit": 10}
Returns per query: embed_ms, search_ms, total_ms and the doc_ids returned, plus
whether this execution environment was cold.
"""

import json
import os
import time
import urllib.request
from typing import Any

import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest

COLD = True
REGION = os.environ.get("AWS_REGION", "eu-west-1")
QDRANT_URL = os.environ.get("QDRANT_URL", "")
VECTOR_BUCKET = os.environ.get("VECTOR_BUCKET", "")
VECTOR_INDEX = os.environ.get("VECTOR_INDEX", "")
EMBEDDINGS_MODEL = os.environ.get("EMBEDDINGS_MODEL", "amazon.titan-embed-text-v2:0")
DIMENSIONS = int(os.environ.get("EMBEDDINGS_DIMENSIONS", "1024"))
COLLECTION = "city-kb"

_session = boto3.Session()
_bedrock = _session.client("bedrock-runtime", region_name=REGION)
_s3vectors = _session.client("s3vectors", region_name=REGION) if VECTOR_BUCKET else None


def _embed(text: str) -> list[float]:
    body = json.dumps({"inputText": text, "dimensions": DIMENSIONS, "normalize": True})
    response = _bedrock.invoke_model(
        modelId=EMBEDDINGS_MODEL, body=body, contentType="application/json"
    )
    return json.loads(response["body"].read())["embedding"]


def _search_qdrant(vector: list[float], limit: int) -> list[str]:
    """Qdrant's HTTP API through the Function URL, signed with SigV4."""
    payload = json.dumps(
        {"query": vector, "using": "dense", "limit": limit, "with_payload": ["doc_id"]}
    ).encode()
    url = f"{QDRANT_URL.rstrip('/')}/collections/{COLLECTION}/points/query"
    request = AWSRequest(
        method="POST",
        url=url,
        data=payload,
        headers={"content-type": "application/json"},
    )
    credentials = _session.get_credentials()
    if credentials is None:
        raise RuntimeError("no credentials for SigV4")
    SigV4Auth(credentials.get_frozen_credentials(), "lambda", REGION).add_auth(request)
    signed = urllib.request.Request(  # noqa: S310 — https Function URL from the environment
        url, data=payload, headers=dict(request.headers), method="POST"
    )
    with urllib.request.urlopen(signed, timeout=30) as response:  # noqa: S310
        body = json.loads(response.read())
    return [point["payload"]["doc_id"] for point in body["result"]["points"]]


def _search_s3vectors(vector: list[float], limit: int) -> list[str]:
    if _s3vectors is None:
        raise RuntimeError("VECTOR_BUCKET is not set")
    response = _s3vectors.query_vectors(
        vectorBucketName=VECTOR_BUCKET,
        indexName=VECTOR_INDEX,
        queryVector={"float32": vector},
        topK=limit,
        returnMetadata=True,
        returnDistance=True,
    )
    return [v["metadata"]["doc_id"] for v in response["vectors"]]


SEARCHES = {"qdrant": _search_qdrant, "s3vectors": _search_s3vectors}


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    global COLD  # the cold start is what we are measuring
    cold = COLD
    COLD = False

    candidate = event.get("candidate", "qdrant")
    search = SEARCHES[candidate]
    limit = int(event.get("limit", 10))
    queries = event.get("queries") or [
        {"id": "warmup", "query": "thermal bath in Buda"}
    ]

    results = []
    for _ in range(int(event.get("repeat", 1))):
        for query in queries:
            started = time.perf_counter()
            vector = _embed(query["query"])
            embedded = time.perf_counter()
            hits = search(vector, limit)
            finished = time.perf_counter()
            results.append(
                {
                    "id": query["id"],
                    "embed_ms": round((embedded - started) * 1000, 1),
                    "search_ms": round((finished - embedded) * 1000, 1),
                    "total_ms": round((finished - started) * 1000, 1),
                    "hits": hits,
                }
            )
    return {"candidate": candidate, "cold": cold, "region": REGION, "results": results}
