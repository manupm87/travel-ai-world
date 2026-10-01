# RAG evaluation

What we measure about the planner's retrieval-augmented answers, how to run it, and the numbers
so far. Umbrella issue: TRA-148. Two measurements, both run by hand (they need AWS) and compared
before and after a change:

1. **Retrieval** — recall@k and MRR of the deployed index over a fixed question set (TRA-263,
   below).
2. **Answers** — groundedness and relevance with an LLM judge over the same questions (TRA-266,
   not done yet).

## Retrieval: recall@k and MRR

`just eval-retrieval [city]` runs `src/backend/services/ai_api/tests/manual/retrieval_eval.py`
(how it works: the ai_api README, "Retrieval eval"). Each question of
`tests/manual/questions/<city>.jsonl` goes through `S3VectorsRetriever.search` with the
planner's city filter and `limit=10`, and lists the `doc_id`s a good answer comes from.

- **recall@k**: share of a question's expected ids found in its first k results, averaged over
  the questions.
- **MRR**: mean of 1 / the rank of the first expected id found (0 when none is in the top 10).

The question set: the 32 Budapest queries of the TRA-151 spike (4 in Spanish), 6 Spanish twins of
Budapest queries with the same expected ids, and 11 Madrid questions (8 in Spanish). Expectations
were chosen by finding the documents about the entity or topic that answers the question (its name,
its listings and articles), not by running the query, so they do not favour one kind of search.

### Baseline, 2026-10-01

Index `travel-ai-vectors/city-kb` (eu-west-1) as loaded in production that day; embeddings
`amazon.titan-embed-text-v2:0` (1024 dimensions); code at `main` `df6b1da` plus TRA-263; top 10
with the city filter; 49 questions, 18 in Spanish (37 %). Every expected id is in the index.

| Set | Questions | R@5 | R@10 | MRR |
|---|---:|---:|---:|---:|
| **all** | 49 | 0.651 | 0.760 | 0.617 |
| budapest | 38 | 0.605 | 0.737 | 0.545 |
| madrid | 11 | 0.811 | 0.841 | 0.864 |
| lang `en` | 31 | 0.715 | 0.806 | 0.616 |
| lang `es` | 18 | 0.542 | 0.681 | 0.617 |

Two breakdowns of the same run (computed once, not printed by the script):

| Subset | Questions | R@5 | R@10 | MRR |
|---|---:|---:|---:|---:|
| The spike's 32 Budapest queries, production index | 32 | 0.641 | 0.781 | 0.554 |
| The same 32 in the spike (its own S3 Vectors index, 2026-09-17 corpus, no filter) | 32 | 0.688 | 0.812 | 0.591 |
| en/es pairs with identical expected ids, English | 8 | 0.521 | 0.625 | 0.469 |
| en/es pairs with identical expected ids, Spanish | 8 | 0.354 | 0.625 | 0.451 |

### Reading

- **recall@10 is 0.760**, just over the 0.75 the memoria sets. On the spike's own queries it is
  0.781 against 0.812 then: about one question's worth, with a bigger corpus and seven cities
  behind a filter in one index.
- **Spanish is not the problem the language split suggests.** Spanish trails English by 0.125 in
  the table, but on the eight pairs that ask the same thing with the same expected ids recall@10
  is equal and MRR within 0.02. The Spanish questions are, on average, the harder intents
  (practical questions, no named place). Titan V2 handles Spanish questions over an English corpus
  well enough that nothing cross-lingual (translation, query rewriting) is called for.
- **The misses cluster**, in both languages:
  - intent without keyword overlap: "children on a rainy afternoon" fails in Budapest and Madrid,
    English and Spanish;
  - one answer among many equal listings: Szimpla Kert for "ruin bars", the restaurants that
    serve cocido;
  - practical prose split in chunks: the second public-transport chunk, the January climate;
  - a generated OpenStreetMap document (Margaret Island) and an accent-less spelling of a
    Wikipedia title (Széchenyi).

  These are the cases TRA-269 (hybrid BM25 + RRF, MMR) would target; this run is its baseline.

### Misses, 2026-10-01

Questions with an expected id outside the top 10, with the rank of each expected id (— = not in
the top 10):

- budapest/szechenyi-plain (en) "szechenyi furdo city park pool": `wv:en:Budapest/Városliget#do:szechenyi-thermal-bath` #3, `wp:en:2613263#s0-c1` —
- budapest/ruin-bars (en) "ruin bars in the Jewish Quarter": `wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi` —
- budapest/bike-tour (en) "guided bike tour of the city": `wv:en:Budapest/Terézváros#do:yellow-zebra-bikes` —
- budapest/aquincum (en) "Roman ruins and archaeology museum": `wv:en:Budapest/Aquincum#see:aquincum-museum-and-archaeological-park` #4, `wp:en:17603979#s0-c1` —
- budapest/public-transport (en) "how do metro and tram tickets work": `wv:en:Budapest#section:get-around/public-transport:c2` —
- budapest/zoo (en) "somewhere to take children on a rainy afternoon": `wv:en:Budapest/Városliget#see:budapest-zoo-and-botanical-garden` —, `wp:en:19905340#s0-c1` —
- budapest/margaret-island (en) "big park on an island in the Danube": `osm:relation/11173422` —
- budapest/clima-enero-es (es) "¿hace mucho frío en enero, nieva?": `om:climate:budapest:01` —, `wv:es:Budapest#section:comprender/clima:c1` —
- budapest/ruin-bars-es (es) "bares en ruinas en el barrio judío": `wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi` —
- budapest/zoo-es (es) "algo para hacer con niños una tarde de lluvia": `wv:en:Budapest/Városliget#see:budapest-zoo-and-botanical-garden` —, `wp:en:19905340#s0-c1` —
- budapest/public-transport-es (es) "cómo funcionan los billetes de metro y tranvía": `wv:en:Budapest#section:get-around/public-transport:c2` —
- madrid/cocido-es (es) "¿dónde comer un buen cocido madrileño?": `wv:en:Madrid/La Latina-Austrias#eat:casa-lucio` —, `osm:node/8676589690` —, `osm:node/13830250001` —, `wv:es:Madrid#section:comer/comidas-tipicas:c1` #1
- madrid/ninos-lluvia-es (es) "algo para hacer con niños si llueve": `wv:en:Madrid/Arganzuela#see:planetario-de-madrid` —, `wv:en:Madrid/Chamberí-Castellana#see:museo-nacional-de-ciencias-naturales` —, `wv:en:Madrid/Northern Suburbs#see:museo-nacional-de-ciencias-naturales` —

### Adding questions

One JSON object per line in `tests/manual/questions/<city>.jsonl` (`id`, `lang`, `query`,
`expected`, `why`); a new file is a new city. Pick the expected ids from the city's
`tools/city_corpus/data/<city>/documents.jsonl` by what answers the question, say how in `why`,
and keep at least 30 % of the questions in Spanish (a unit test checks the share and the format).
A new question changes the totals: record a new baseline rather than comparing across sets.

## Answers: groundedness and relevance

TRA-266: an LLM judge scores the planner's answers to the same questions. Not done yet.
