import json
from pathlib import Path

import numpy as np
import pytest
from vector_store_bench import artifact


class FakeS3:
    """Uploads into a directory; downloads from it."""

    def __init__(self, store: Path) -> None:
        self.store = store
        self.uploaded: list[str] = []

    def upload_file(self, filename: str, bucket: str, key: str) -> None:
        target = self.store / bucket / key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(Path(filename).read_bytes())
        self.uploaded.append(key)

    def download_file(self, bucket: str, key: str, filename: str) -> None:
        Path(filename).write_bytes((self.store / bucket / key).read_bytes())


def _written(tmp_path: Path) -> Path:
    directory = tmp_path / "artifact"
    corpus = tmp_path / "documents.jsonl"
    corpus.write_text('{"doc_id": "a"}\n', encoding="utf-8")
    artifact.write(
        directory,
        ["a", "b"],
        np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32),
        corpus=corpus,
        tokens=7,
    )
    return directory


def test_write_records_the_contract_and_both_checksums(tmp_path: Path) -> None:
    directory = _written(tmp_path)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["model_id"] == "amazon.titan-embed-text-v2:0"
    assert manifest["dimensions"] == 1024
    assert manifest["normalize"] == "true"
    assert manifest["documents"] == 2
    assert manifest["input_tokens"] == 7
    assert len(manifest["corpus_sha256"]) == 64
    assert manifest["vectors_sha256"] == artifact.sha256(directory / "vectors.npy")


def test_read_round_trips(tmp_path: Path) -> None:
    embeddings = artifact.read(_written(tmp_path))
    assert embeddings.doc_ids == ["a", "b"]
    assert embeddings.vectors.shape == (2, 2)


def test_push_then_pull_verifies_the_checksum(tmp_path: Path) -> None:
    directory = _written(tmp_path)
    client = FakeS3(tmp_path / "s3")

    keys = artifact.push(directory, "bucket", "embeddings/budapest", client)
    assert keys == [
        "embeddings/budapest/vectors.npy",
        "embeddings/budapest/ids.json",
        "embeddings/budapest/manifest.json",
    ]

    artifact.pull(tmp_path / "back", "bucket", "embeddings/budapest", client)
    assert artifact.read(tmp_path / "back").doc_ids == ["a", "b"]


def test_pull_rejects_vectors_that_do_not_match_the_manifest(tmp_path: Path) -> None:
    directory = _written(tmp_path)
    client = FakeS3(tmp_path / "s3")
    artifact.push(directory, "bucket", "p", client)
    # Someone replaces the matrix without updating the manifest.
    np.save(
        tmp_path / "s3" / "bucket" / "p" / "vectors.npy",
        np.zeros((2, 2), dtype=np.float32),
    )

    with pytest.raises(ValueError, match="the manifest says"):
        artifact.pull(tmp_path / "back", "bucket", "p", client)
