from city_corpus.normalize import (
    chunk_paragraphs,
    clean_whitespace,
    estimate_tokens,
    slugify,
    to_text,
    unique_ids,
    wiki_url,
)


def _paragraph(n_words: int, tag: str) -> str:
    return " ".join(f"{tag}{i}" for i in range(n_words))


def test_to_text_keeps_labels_and_drops_markup() -> None:
    wikitext = (
        "'''Bold''' [[Budapest/Budavár|Castle Hill]] and [[Danube]] "
        "[[File:x.jpg|thumb|caption]]{{Pagebanner|x.png}}"
        "[https://example.org site] {{C|30}}&nbsp;<ref>cite</ref>"
    )
    assert clean_whitespace(to_text(wikitext)) == (
        "Bold Castle Hill and Danube site 30 °C"
    )


def test_tables_and_comments_are_dropped() -> None:
    wikitext = 'Before\n{| class="wikitable"\n| a || b\n|}\n<!-- note -->After'
    assert clean_whitespace(to_text(wikitext)) == "Before\n\nAfter"


def test_chunks_respect_max_and_overlap_one_paragraph() -> None:
    paragraphs = [_paragraph(150, tag) for tag in "abcde"]  # 195 tokens each
    chunks = chunk_paragraphs(paragraphs, min_tokens=250, max_tokens=500)

    assert all(estimate_tokens(c) <= 500 for c in chunks)
    assert chunks[0].split("\n\n") == paragraphs[0:2]
    # The next chunk starts with the last paragraph of the previous one.
    assert chunks[1].split("\n\n")[0] == paragraphs[1]
    assert chunks[-1].split("\n\n")[-1] == paragraphs[-1]


def test_short_tail_is_folded_into_previous_chunk() -> None:
    paragraphs = [_paragraph(150, "a"), _paragraph(30, "b"), _paragraph(20, "c")]
    assert chunk_paragraphs(paragraphs, min_tokens=250, max_tokens=500) == [
        "\n\n".join(paragraphs)
    ]


def test_oversized_paragraph_is_split_by_sentences() -> None:
    sentence = _paragraph(99, "w") + "."
    chunks = chunk_paragraphs([" ".join([sentence] * 6)], max_tokens=300)
    assert len(chunks) > 1
    assert all(estimate_tokens(c) <= 300 for c in chunks)


def test_single_small_section_is_one_chunk() -> None:
    assert chunk_paragraphs(["Short text."]) == ["Short text."]


def test_slugify_and_urls() -> None:
    assert (
        slugify("Széchenyi lánchíd / Chain Bridge!") == "szechenyi-lanchid-chain-bridge"
    )
    assert slugify("!!!") == "untitled"
    assert wiki_url("en.wikivoyage.org", "Budapest/Óbuda", "Get in") == (
        "https://en.wikivoyage.org/wiki/Budapest/%C3%93buda#Get_in"
    )


def test_unique_ids_are_deterministic() -> None:
    claim = unique_ids()
    assert [claim("a"), claim("b"), claim("a"), claim("a")] == ["a", "b", "a~2", "a~3"]
