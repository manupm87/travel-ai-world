"""The evaluation set must stay in step with the committed corpus."""

from pathlib import Path

import pytest
from vector_store_bench import corpus, evalset

CORPUS = (
    Path(__file__).resolve().parents[3]
    / "city_corpus"
    / "data"
    / "budapest"
    / "documents.jsonl"
)


def test_the_set_is_loadable_and_broad_enough() -> None:
    queries = evalset.load()

    assert len(queries) >= 30
    assert len({q.id for q in queries}) == len(queries)
    assert sum(1 for q in queries if q.lang == "es") >= 4
    assert all(q.why for q in queries), "every query says what it tests"


@pytest.mark.skipif(not CORPUS.exists(), reason="corpus not built")
def test_every_expected_document_exists_in_the_corpus() -> None:
    known = {d.doc_id for d in corpus.load(CORPUS)}
    missing = sorted(
        f"{q.id}: {doc_id}"
        for q in evalset.load()
        for doc_id in q.expected
        if doc_id not in known
    )
    assert not missing, missing


@pytest.mark.skipif(not CORPUS.exists(), reason="corpus not built")
def test_the_corpus_loads_with_the_fields_the_stores_index() -> None:
    documents = corpus.load(CORPUS)

    assert len(documents) > 5_000
    filterable = documents[0].filterable()
    assert filterable["city"] == "budapest"
    assert "text" not in filterable  # text is the payload, never a filter
    tours = [d for d in documents if d.category == "tour"]
    assert tours and all(d.tour_type for d in tours)
