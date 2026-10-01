"""The retrieval eval (TRA-263): its metrics, its runner over a fake retriever
and its question sets. The script itself runs by hand against the index."""

import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from ai_api.domain.models import Document
from ai_api.testing import FakeRetriever

SCRIPT = Path(__file__).parent / "manual" / "retrieval_eval.py"


def _load_script() -> ModuleType:
    """By path: pytest ignores `tests/manual`, and the folder is no package
    a test can import (see `planner_smoke.py`)."""
    spec = importlib.util.spec_from_file_location("retrieval_eval", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look their module up
    spec.loader.exec_module(module)
    return module


ev = _load_script()


def _doc(doc_id: str, city: str) -> Document:
    return Document(id=doc_id, content="", metadata={"city": city})


def test_recall_counts_the_expected_ids_within_k() -> None:
    found = ["a", "b", "c"]

    assert ev.recall_at(found, ["c", "z"], 2) == 0
    assert ev.recall_at(found, ["c", "z"], 3) == 0.5
    assert ev.recall_at(found, [], 3) == 0


def test_reciprocal_rank_is_one_over_the_first_expected_rank() -> None:
    assert ev.reciprocal_rank(["a", "b", "c"], ["c", "b"]) == 0.5
    assert ev.reciprocal_rank(["a"], ["z"]) == 0


async def test_each_question_is_searched_in_its_own_city() -> None:
    retriever = FakeRetriever(
        [_doc("bp-1", "budapest"), _doc("md-1", "madrid"), _doc("md-2", "madrid")]
    )
    questions = [
        ev.Question("madrid", "q1", "es", "museo", ("md-2",)),
        ev.Question("budapest", "q2", "en", "bath", ("bp-1", "bp-9")),
    ]

    results = await ev.evaluate(retriever, questions)

    assert [filters.city for _, _, filters in retriever.searches] == [
        "madrid",
        "budapest",
    ]
    assert all(limit == ev.TOP_K for _, limit, _ in retriever.searches)
    assert results[0].found == ("md-1", "md-2")
    assert results[0].reciprocal_rank == 0.5
    assert results[1].recall(10) == 0.5
    assert await ev.missing_from_index(retriever, questions) == ["bp-9"]


async def test_the_report_has_totals_groups_and_the_misses() -> None:
    retriever = FakeRetriever([_doc("md-1", "madrid")])
    questions = [
        ev.Question("madrid", "hit", "en", "a", ("md-1",)),
        ev.Question("madrid", "miss", "es", "b", ("md-1", "md-9")),
    ]

    text = ev.report(await ev.evaluate(retriever, questions), ["md-9"])

    assert "| **all** | 2 | 0.750 | 0.750 | 1.000 |" in text
    assert "| lang `es` | 1 | 0.500 | 0.500 | 1.000 |" in text
    assert "- `md-9`" in text
    assert "madrid/miss (es)" in text
    assert "`md-1` #1, `md-9` —" in text
    assert "madrid/hit" not in text


def test_the_question_sets_are_well_formed_and_a_third_spanish() -> None:
    questions = [q for c in ev.cities_with_questions() for q in ev.load_questions(c)]

    assert {"budapest", "madrid"} <= set(ev.cities_with_questions())
    assert len({(q.city, q.id) for q in questions}) == len(questions)
    assert all(q.lang in {"en", "es"} and q.expected for q in questions)
    spanish = sum(q.lang == "es" for q in questions)
    assert spanish / len(questions) >= 0.3
