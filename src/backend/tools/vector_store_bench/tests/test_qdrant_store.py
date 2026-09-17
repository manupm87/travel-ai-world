import numpy as np
from vector_store_bench.stores.qdrant_store import QdrantStore

DOCS = [
    (
        "gellert",
        "Gellért Baths, an art nouveau thermal bath on the Buda side.",
        [1.0, 0.0, 0.0],
    ),
    (
        "szimpla",
        "Szimpla Kert, the original ruin bar of the Jewish Quarter.",
        [0.0, 1.0, 0.0],
    ),
    (
        "parliament",
        "The Hungarian Parliament Building on Kossuth square.",
        [0.0, 0.0, 1.0],
    ),
]


def _store() -> QdrantStore:
    store = QdrantStore.in_memory()
    store.create(dimensions=3)
    doc_ids = [d[0] for d in DOCS]
    store.index(
        doc_ids,
        np.array([d[2] for d in DOCS], dtype=np.float32),
        [{"doc_id": d[0], "city": "budapest"} for d in DOCS],
    )
    store.build_keyword_index(doc_ids, [d[1] for d in DOCS])
    return store


def test_dense_search_returns_doc_ids_from_the_payload() -> None:
    hits = _store().search(np.array([1.0, 0.0, 0.0], dtype=np.float32), limit=2)
    assert [h.doc_id for h in hits] == ["gellert", "szimpla"] or hits[
        0
    ].doc_id == "gellert"
    assert hits[0].score > hits[1].score


def test_hybrid_brings_in_what_only_the_keywords_find() -> None:
    store = _store()
    # A vector that points at "gellert" with a query that names the ruin bar.
    hits = store.search_hybrid(
        np.array([1.0, 0.0, 0.0], dtype=np.float32), "szimpla kert ruin bar", limit=3
    )
    assert {h.doc_id for h in hits[:2]} == {"gellert", "szimpla"}
