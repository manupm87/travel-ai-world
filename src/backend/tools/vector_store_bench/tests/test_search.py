import numpy as np
import pytest
from vector_store_bench.search import (
    Bm25Index,
    Hit,
    exact_search,
    reciprocal_rank_fusion,
    tokenize,
)

DOCS = {
    "gellert": "Gellért Baths, an art nouveau thermal bath on the Buda side.",
    "szechenyi": "Széchenyi thermal bath in the City Park, the largest in Budapest.",
    "szimpla": "Szimpla Kert, the original ruin bar of the Jewish Quarter.",
    "parliament": "The Hungarian Parliament Building on Kossuth square.",
}


def _index() -> Bm25Index:
    return Bm25Index(list(DOCS), list(DOCS.values()))


def test_tokenize_folds_accents_and_case() -> None:
    assert tokenize("Gellért Fürdő, 2 db!") == ["gellert", "furdo", "2", "db"]


def test_bm25_finds_the_document_that_names_the_term() -> None:
    hits = _index().search("gellert baths", limit=2)
    assert hits[0].doc_id == "gellert"
    assert hits[0].score > 0


def test_bm25_accented_query_matches_unaccented_text() -> None:
    assert _index().search("Széchenyi", limit=1)[0].doc_id == "szechenyi"


def test_bm25_ignores_unknown_terms_and_can_return_nothing() -> None:
    assert _index().search("zeppelin", limit=5) == []


def test_bm25_is_deterministic_on_ties() -> None:
    index = Bm25Index(["b", "a"], ["same words here", "same words here"])
    assert [h.doc_id for h in index.search("same words", limit=2)] == ["a", "b"]


def test_exact_search_ranks_by_cosine() -> None:
    matrix = np.array([[1.0, 0.0], [0.7071, 0.7071], [0.0, 1.0]])
    hits = exact_search(matrix, np.array([1.0, 0.0]), limit=3, doc_ids=["x", "y", "z"])
    assert [h.doc_id for h in hits] == ["x", "y", "z"]
    assert hits[0].score == pytest.approx(1.0)


def test_rrf_prefers_documents_both_rankings_agree_on() -> None:
    dense = [Hit("a", 0.9), Hit("b", 0.8), Hit("c", 0.7)]
    keyword = [Hit("c", 12.0), Hit("a", 3.0)]

    fused = reciprocal_rank_fusion([dense, keyword], limit=3)

    # "a" is 1st and 2nd; "c" is 3rd and 1st; "b" appears once.
    assert [h.doc_id for h in fused] == ["a", "c", "b"]
    assert fused[0].score == pytest.approx(1 / 61 + 1 / 62)


def test_rrf_scores_do_not_depend_on_the_magnitudes() -> None:
    dense = [Hit("a", 0.9), Hit("b", 0.1)]
    keyword = [Hit("b", 1000.0), Hit("a", 0.001)]
    fused = reciprocal_rank_fusion([dense, keyword], limit=2)
    assert fused[0].score == fused[1].score  # symmetric ranks, equal scores
    assert [h.doc_id for h in fused] == ["a", "b"]  # tie broken by doc_id
