"""Fill the collection at image build time, against a Qdrant started next to it.

Runs inside the builder stage only: the payload it writes is the same metadata
S3 Vectors holds (ADR 0014), so both candidates answer with the same fields.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
from qdrant_client import QdrantClient, models

ARTIFACT = Path("/build/artifact")
CORPUS = Path("/build/documents.jsonl")
COLLECTION = "city-kb"
DENSE = "dense"
BATCH = 500


def main() -> int:
    vectors = np.load(ARTIFACT / "vectors.npy")
    doc_ids = json.loads((ARTIFACT / "ids.json").read_text(encoding="utf-8"))
    manifest = json.loads((ARTIFACT / "manifest.json").read_text(encoding="utf-8"))
    documents = {}
    with CORPUS.open(encoding="utf-8") as lines:
        for line in lines:
            if line.strip():
                document = json.loads(line)
                documents[document["doc_id"]] = document

    client = QdrantClient(url="http://127.0.0.1:6333", timeout=120)
    if client.collection_exists(COLLECTION):
        client.delete_collection(COLLECTION)
    client.create_collection(
        collection_name=COLLECTION,
        vectors_config={
            DENSE: models.VectorParams(
                size=vectors.shape[1], distance=models.Distance.COSINE
            )
        },
        # One segment instead of the default handful: on Lambda the collection is
        # opened from scratch at every cold start, and recovering thirteen small
        # segments cost about 1.5 s of the 3 s init. Vectors stay in RAM
        # (on_disk defaults to false): queries matter more than resident memory.
        optimizers_config=models.OptimizersConfigDiff(default_segment_number=1),
    )

    filterable = (
        "city",
        "category",
        "district",
        "kind",
        "lang",
        "source",
        "price_tier",
        "tour_type",
        "price_model",
        "lat",
        "lon",
    )
    for start in range(0, len(doc_ids), BATCH):
        stop = min(start + BATCH, len(doc_ids))
        payloads = []
        for doc_id in doc_ids[start:stop]:
            document = documents[doc_id]
            payload = {
                k: document[k] for k in filterable if document.get(k) is not None
            }
            payload |= {
                "doc_id": doc_id,
                "text": document["text"],
                "name": document.get("name"),
                "url": document.get("url"),
                "source_url": document["source_url"],
                "heading_path": document["heading_path"],
            }
            payloads.append(payload)
        client.upsert(
            collection_name=COLLECTION,
            points=models.Batch(
                ids=list(range(start, stop)),
                vectors={DENSE: vectors[start:stop].tolist()},
                payloads=payloads,
            ),
            wait=True,
        )

    count = client.count(COLLECTION, exact=True).count
    segments = _wait_for_one_segment(client)
    print(
        f"loaded {count} points of {manifest['dimensions']} dimensions "
        f"in {segments} segment(s)"
    )
    return 0 if count == len(doc_ids) else 1


def _wait_for_one_segment(client: QdrantClient, timeout_s: int = 180) -> int:
    """Wait for the optimizer to settle, not for a particular number.

    The image must not be frozen mid-merge, or the cold start pays for the
    leftovers. But a small collection may legitimately stop at more than one
    segment, so the wait ends when the count stops moving and the collection is
    green, and the caller reports whatever it got.
    """
    deadline = time.monotonic() + timeout_s
    stable = 0
    previous = -1
    while time.monotonic() < deadline:
        info = client.get_collection(COLLECTION)
        segments = info.segments_count or 0
        green = info.status == models.CollectionStatus.GREEN
        stable = stable + 1 if green and segments == previous else 0
        previous = segments
        if green and (segments <= 1 or stable >= 3):
            return segments
        time.sleep(2)
    print(f"warning: optimizer still moving after {timeout_s}s", file=sys.stderr)
    return previous
