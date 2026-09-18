"""`python -m ai_api.indexing` against an in-memory store: no network, no credentials."""

import json
from pathlib import Path
from typing import Any

import pytest
from ai_api.config import AISettings
from ai_api.indexing import (
    MAX_TOTAL_BYTES,
    CorpusDocument,
    index_corpus,
    metadata_for,
)
from ai_api.infrastructure.s3vectors import NON_FILTERABLE_KEYS, vector_key
from ai_api.testing import FakeEmbedder

SETTINGS = AISettings(VECTOR_BUCKET="bucket", VECTOR_INDEX="index")


def _doc(n: int, **overrides: Any) -> dict[str, Any]:
    document = {
        "doc_id": f"wv:en:Budapest#see:place-{n}",
        "city": "budapest",
        "district": "Belváros",
        "category": "see",
        "kind": "listing",
        "name": f"Place {n}",
        "text": f"Place {n} is worth a visit",
        "heading_path": "Budapest > See",
        "lat": 47.5,
        "lon": 19.05,
        "source": "wikivoyage",
        "source_url": "https://en.wikivoyage.org/wiki/Budapest",
        "license": "CC BY-SA 4.0",
        "lang": "en",
    }
    return {**document, **overrides}


def _corpus(tmp_path: Path, documents: list[dict[str, Any]]) -> Path:
    path = tmp_path / "documents.jsonl"
    path.write_text(
        "".join(json.dumps(d, ensure_ascii=False) + "\n" for d in documents),
        encoding="utf-8",
    )
    return path


class FakeStore:
    """An index in a dict, paginating `list_vectors` like the real one."""

    def __init__(self, page_size: int = 2) -> None:
        self.vectors: dict[str, dict[str, Any]] = {}
        self.put_batches: list[int] = []
        self.page_size = page_size

    def put_vectors(self, **kwargs: Any) -> Any:
        assert (kwargs["vectorBucketName"], kwargs["indexName"]) == ("bucket", "index")
        self.put_batches.append(len(kwargs["vectors"]))
        for vector in kwargs["vectors"]:
            self.vectors[vector["key"]] = vector
        return {}

    def list_vectors(self, **kwargs: Any) -> Any:
        keys = sorted(self.vectors)
        start = int(kwargs.get("nextToken") or 0)
        page = keys[start : start + self.page_size]
        response: dict[str, Any] = {"vectors": [{"key": k} for k in page]}
        if start + self.page_size < len(keys):
            response["nextToken"] = str(start + self.page_size)
        return response

    def delete_vectors(self, **kwargs: Any) -> Any:
        for key in kwargs["keys"]:
            del self.vectors[key]
        return {}

    def get_vectors(self, **kwargs: Any) -> Any:  # pragma: no cover - unused
        raise NotImplementedError

    def query_vectors(self, **kwargs: Any) -> Any:  # pragma: no cover - unused
        raise NotImplementedError


async def _index(path: Path, store: FakeStore, **kwargs: Any):
    return await index_corpus(
        path, settings=SETTINGS, embedder=FakeEmbedder(), client=store, **kwargs
    )


def test_the_metadata_is_split_into_what_filters_and_what_shows():
    document = CorpusDocument.model_validate(
        _doc(1, image_url="https://upload.wikimedia.org/x.jpg", hours=None)
    )

    metadata = metadata_for(document)

    assert {k: metadata[k] for k in ("city", "category", "district", "lat")} == {
        "city": "budapest",
        "category": "see",
        "district": "Belváros",
        "lat": 47.5,
    }
    assert metadata["text"] == "Place 1 is worth a visit"
    assert metadata["doc_id"] == "wv:en:Budapest#see:place-1"
    # Fields this module does not name travel in `extra`; nulls are dropped.
    assert json.loads(metadata["extra"]) == {
        "license": "CC BY-SA 4.0",
        "image_url": "https://upload.wikimedia.org/x.jpg",
    }
    assert set(metadata) - set(NON_FILTERABLE_KEYS) == {
        "city",
        "category",
        "district",
        "kind",
        "lang",
        "source",
        "lat",
        "lon",
    }


def test_tour_type_and_price_model_are_filterable():
    """So "free tours" and "boat tours" are a filter (TRA-154)."""
    document = CorpusDocument.model_validate(
        _doc(1, category="tour", tour_type="boat", price_model="tip-based")
    )

    metadata = metadata_for(document)

    assert (metadata["tour_type"], metadata["price_model"]) == ("boat", "tip-based")
    assert "tour_type" not in json.loads(metadata["extra"])


def test_the_key_is_ascii_and_stable_for_an_accented_doc_id():
    doc_id = "wv:en:Budapest/Erzsébetváros#drink:szimpla-kert"

    assert vector_key(doc_id) == vector_key(doc_id)
    assert vector_key(doc_id).isascii()
    assert vector_key(doc_id) != vector_key(doc_id.replace("é", "e"))


async def test_loads_every_document_in_batches_and_counts_the_tokens(tmp_path):
    store = FakeStore()

    report = await _index(
        _corpus(tmp_path, [_doc(n) for n in range(5)]), store, batch_size=2
    )

    assert store.put_batches == [2, 2, 1]
    assert (report.documents, report.vectors_written) == (5, 5)
    assert report.tokens == 5 * 6, "one token per word, six words each"
    stored = store.vectors[vector_key("wv:en:Budapest#see:place-3")]
    assert stored["metadata"]["name"] == "Place 3"
    assert len(stored["data"]["float32"]) == FakeEmbedder().dimensions


async def test_a_second_run_overwrites_and_prunes_what_the_file_dropped(tmp_path):
    store = FakeStore()
    await _index(_corpus(tmp_path, [_doc(n) for n in range(5)]), store)

    report = await _index(_corpus(tmp_path, [_doc(n) for n in range(3)]), store)

    assert report.vectors_deleted == 2
    assert sorted(store.vectors) == sorted(
        vector_key(f"wv:en:Budapest#see:place-{n}") for n in range(3)
    )


async def test_a_limited_run_never_prunes(tmp_path):
    store = FakeStore()
    path = _corpus(tmp_path, [_doc(n) for n in range(5)])
    await _index(path, store)

    report = await _index(path, store, limit=2)

    assert (report.vectors_written, report.vectors_deleted) == (2, 0)
    assert len(store.vectors) == 5


async def test_a_dry_run_measures_without_writing(tmp_path):
    store = FakeStore()

    report = await _index(_corpus(tmp_path, [_doc(1)]), store, dry_run=True)

    assert report.documents == 1
    assert report.max_total_bytes > 0
    assert store.vectors == {}


async def test_an_oversized_document_is_skipped_and_nothing_is_pruned(tmp_path):
    store = FakeStore()
    await _index(_corpus(tmp_path, [_doc(1), _doc(2)]), store)
    huge = _doc(3, text="x" * (MAX_TOTAL_BYTES + 1))

    report = await _index(_corpus(tmp_path, [_doc(1), huge]), store)

    assert report.oversized == ["wv:en:Budapest#see:place-3"]
    assert report.vectors_deleted == 0
    assert vector_key("wv:en:Budapest#see:place-2") in store.vectors


async def test_a_malformed_line_names_itself(tmp_path):
    path = _corpus(tmp_path, [_doc(1)])
    with path.open("a", encoding="utf-8") as f:
        f.write('{"doc_id": "no-text"}\n')

    with pytest.raises(
        SystemExit, match=r"documents\.jsonl:2 is not a corpus document"
    ):
        await _index(path, FakeStore())
