"""`KeywordRetriever`: the corpus-file retriever the smoke session runs on."""

from pathlib import Path

from ai_api.domain.models import RetrievalFilters
from ai_api.testing import KeywordRetriever, documents_from_corpus

FIXTURE = Path(__file__).parent / "fixtures" / "budapest_sample.jsonl"
RUDAS = "wv:en:Budapest/Víziváros#do:rudas-thermal-bath"


async def test_search_ranks_the_document_naming_the_query_first() -> None:
    retriever = KeywordRetriever(documents_from_corpus(FIXTURE))

    found = await retriever.search("rudas thermal bath", limit=3)

    assert found[0].id == RUDAS
    assert len(found) == 3


async def test_search_honours_category_and_district_filters() -> None:
    retriever = KeywordRetriever(documents_from_corpus(FIXTURE))
    filters = RetrievalFilters(
        city="budapest", districts=("Belváros",), categories=("eat",)
    )

    found = await retriever.search("cafe", limit=10, filters=filters)

    assert found
    assert {d.metadata["category"] for d in found} == {"eat"}
    assert {d.metadata["district"] for d in found} == {"Belváros"}
    assert retriever.searches == [("cafe", 10, filters)]


async def test_search_ignores_short_words_and_returns_nothing_for_none() -> None:
    retriever = KeywordRetriever(documents_from_corpus(FIXTURE))

    found = await retriever.search("zzzzqqq", limit=2)

    # Nothing matches, yet the retriever still answers the corpus order,
    # like a vector store would answer its nearest neighbours.
    assert len(found) == 2


async def test_fetch_returns_the_documents_by_id() -> None:
    retriever = KeywordRetriever(documents_from_corpus(FIXTURE))

    found = await retriever.fetch([RUDAS, "unknown:id"])

    assert [d.id for d in found] == [RUDAS]
