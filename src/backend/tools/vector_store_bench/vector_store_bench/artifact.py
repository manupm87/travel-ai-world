"""The embeddings artifact: one file pair both candidates are loaded from.

Titan is deterministic, so this is strictly an optimisation — but it also makes
the benchmark reproducible without re-embedding, and lets `ai_api`'s indexer load
exactly the same vectors (TRA-152) instead of computing its own.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from vector_store_bench.embedder import DIMENSIONS, MODEL_ID


@dataclass(frozen=True)
class Embeddings:
    doc_ids: list[str]
    vectors: np.ndarray
    manifest: dict[str, str | int | float]

    def __post_init__(self) -> None:
        if len(self.doc_ids) != self.vectors.shape[0]:
            raise ValueError(
                f"{len(self.doc_ids)} ids against {self.vectors.shape[0]} vectors"
            )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write(
    directory: Path,
    doc_ids: list[str],
    vectors: np.ndarray,
    *,
    corpus: Path,
    tokens: int = 0,
) -> dict[str, str | int | float]:
    directory.mkdir(parents=True, exist_ok=True)
    vectors_path = directory / "vectors.npy"
    np.save(vectors_path, vectors.astype(np.float32))
    (directory / "ids.json").write_text(
        json.dumps(doc_ids, ensure_ascii=False), encoding="utf-8"
    )
    manifest: dict[str, str | int | float] = {
        "model_id": MODEL_ID,
        "dimensions": DIMENSIONS,
        "normalize": "true",
        "documents": len(doc_ids),
        "corpus": corpus.name,
        "corpus_sha256": sha256(corpus),
        "vectors_sha256": sha256(vectors_path),
        "input_tokens": tokens,
        "built_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    (directory / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


FILES = ("vectors.npy", "ids.json", "manifest.json")


def push(directory: Path, bucket: str, prefix: str, client: object = None) -> list[str]:
    """Upload the artefact so both candidates can be filled from the same vectors."""
    if client is None:
        import boto3

        client = boto3.client("s3")
    keys = []
    for name in FILES:
        key = f"{prefix.strip('/')}/{name}"
        client.upload_file(str(directory / name), bucket, key)  # type: ignore[attr-defined]
        keys.append(key)
    return keys


def pull(
    directory: Path, bucket: str, prefix: str, client: object = None
) -> list[Path]:
    """Download it, then check the vectors are the ones the manifest names."""
    if client is None:
        import boto3

        client = boto3.client("s3")
    directory.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in FILES:
        path = directory / name
        client.download_file(bucket, f"{prefix.strip('/')}/{name}", str(path))  # type: ignore[attr-defined]
        paths.append(path)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    digest = sha256(directory / "vectors.npy")
    if digest != manifest["vectors_sha256"]:
        raise ValueError(
            f"vectors.npy is {digest}, the manifest says {manifest['vectors_sha256']}"
        )
    return paths


def read(directory: Path) -> Embeddings:
    vectors = np.load(directory / "vectors.npy")
    doc_ids = json.loads((directory / "ids.json").read_text(encoding="utf-8"))
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    return Embeddings(doc_ids=doc_ids, vectors=vectors, manifest=manifest)
