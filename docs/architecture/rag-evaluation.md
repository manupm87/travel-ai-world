# RAG evaluation

What we measure about the planner's retrieval-augmented answers, how to run it, and the current
numbers. Two measurements, compared before and after a change:

1. **Retrieval**: recall@k and MRR of the deployed index over a fixed question set.
2. **Answers**: groundedness and relevance of the planner's answers to the same questions, graded
   by an LLM judge.

## Retrieval: recall@k and MRR

**Run evaluation** in the admin console (`/admin/quality/`: every city, no credentials needed) or
`just eval-retrieval [city]` from a laptop with an AWS session run the same
`ai_api/application/retrieval_eval.py` (how it works: the ai_api README, "Retrieval eval"). Each
question of `ai_api/data/eval_questions/<city>.jsonl` goes through `S3VectorsRetriever.search`
with the planner's city filter and `limit=10`, and lists the `doc_id`s a good answer comes from.

- **recall@k**: share of a question's expected ids found in its first k results, averaged over
  the questions.
- **MRR**: mean of 1 / the rank of the first expected id found (0 when none is in the top 10).

**The question set: 20 per city, 120 in all.** Every city has 12 questions in English and 8 in
Spanish, 3 of the Spanish ones twins of English ones with the same expected ids, and the same mix:
6 named places (some typed without accents or in lower case), 3 descriptive ones (the place
described, never named), the airport and public-transport tickets, a climate month, food or
drink, 2 intents with no keyword overlap with the answer ("something to do with the kids when it
rains"), and a tour. Expectations were chosen by finding the documents about the entity or topic
that answers (its listings, its article's lead, a section when the question asks about it), never
by running the question, so they favour no kind of search. Some intents have more valid answers
than the 1 to 4 listed (other museums for children, other bars): those questions are hard on
purpose and their recall is a lower bound.

### Current baseline

Production index `travel-ai-vectors/city-kb` (eu-west-1) in ENHANCED mode
([ADR 0033](adr/0033-city-kb-enhanced-index-mode.md)), six cities; embeddings
`amazon.titan-embed-text-v2:0` (1024 dimensions); top 10 with the city filter, as `ai_api`
queries it. Two runs, identical:

| | R@10 | MRR | Berlin | Bologna | Budapest | Los Angeles | Madrid | Miami |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Production (baseline)** | **0.768** | **0.686** | 0.679 | 0.838 | 0.725 | 0.908 | 0.733 | 0.725 |

Exact search over the same vectors is the ceiling: R@10 **0.783**, MRR **0.690**.

### By language

A run of the same 120 questions on the CLASSIC index over an earlier corpus, with the breakdown
the script prints by city and language:

| Set | Questions | R@5 | R@10 | MRR |
|---|---:|---:|---:|---:|
| **all** | 120 | 0.635 | 0.726 | 0.656 |
| berlin | 20 | 0.554 | 0.667 | 0.549 |
| bologna | 20 | 0.604 | 0.713 | 0.771 |
| budapest | 20 | 0.517 | 0.675 | 0.466 |
| los-angeles | 20 | 0.817 | 0.858 | 0.721 |
| madrid | 20 | 0.688 | 0.721 | 0.717 |
| miami | 20 | 0.633 | 0.725 | 0.713 |
| lang `en` | 72 | 0.602 | 0.692 | 0.602 |
| lang `es` | 48 | 0.686 | 0.778 | 0.736 |

The twins ask the same thing in both languages with the same expected ids (computed from a
second run of the same set, not printed by the script):

| Subset | Questions | R@5 | R@10 | MRR |
|---|---:|---:|---:|---:|
| Twins, English | 18 | 0.546 | 0.620 | 0.519 |
| Twins, Spanish | 18 | 0.528 | 0.644 | 0.644 |

### Reading

- **Spanish is not the weak side.** On the twins Spanish matches English on recall@10 and beats it
  on MRR; overall it scores higher (0.778 against 0.692) because the Spanish originals are easier
  (named places, climate). Titan V2 handles Spanish questions over a mostly English corpus well
  enough that nothing cross-lingual (translation, query rewriting) is called for.
- **The misses cluster**, in both languages:
  - **children on a rainy day** fails in every city that has it (Berlin, Budapest, Madrid, Miami):
    the embedding does not connect "kids + rain" with a museum or an aquarium;
  - **the Wikipedia lead** of a place is often missing while its Wikivoyage listing is found
    (Checkpoint Charlie, Griffith Observatory, the Barnacle, Tempelhof): a partial miss;
  - **practical prose** in some cities (Bologna's airport and bus tickets in English, the second
    public-transport chunk of Budapest);
  - **one answer among many equal listings** (Szimpla Kert for "ruin bars", the restaurants that
    serve cocido, Friedrichshain's bars).

  These are the cases hybrid search (BM25 + RRF) or MMR would target.
- **This set is harder than the spike's.** On the 32 Budapest queries of the
  [vector store spike](vector-store-spike.md), the production index gives R@10 0.781, against 0.812
  in the spike's own single-city index.

### Accepting a change: improvement and loss range

A change to a corpus, the index or the retriever ships only when it improves something and loses
nothing, with one narrow exception. Measure per city, per metric (R@5, R@10, MRR) and per kind of
question (named place, descriptive, airport, tickets, climate, food or drink, intent, tour; the mix of
"The question set" above). One question is 0.05 of a city's R@10, and one expected id of a question is
0.0125 to 0.025.

**Which instrument.** S3 Vectors searches approximately, and the noise is larger than the rule's
thresholds (see "Index noise" below):

- **A corpus change** is measured with **exact search over the embeddings**: brute-force cosine over
  the city's vectors, before and after, with the same query vectors. Unchanged documents keep their
  embeddings, so only the changed ones are embedded (cents). This is deterministic, so the thresholds
  apply as written. Comparing two index builds, or rewriting the changed vectors in one index, mixes
  the corpus effect with the index's re-partitioning, and cannot pass or fail a change.
- **A retriever or index change** (topK, mode, filters) is measured on one index, both variants back
  to back, never across two builds.
- **After reindexing production**, `eval-retrieval` is a check that nothing broke, read against the
  noise floor below, not a second gate.

1. **No loss, by default.**
   - No city's R@10 or MRR goes down.
   - No expected id that was in a question's top 10 leaves it.
   - Nothing a traveller uses shrinks in the readiness report: pictured hotels, located places,
     districts, the pictured share of sights. Documents nobody could be offered may go, for
     example a hotel without a photo.
2. **The exception, only when all three hold:**
   - the loss is at most one expected id per city (≤ 0.025 of R@10 and ≤ 0.03 of MRR);
   - no kind of question in any city drops by more than 0.05;
   - a kind of question that scored under 0.50 rises by at least 0.15.
3. **Worth shipping:** the change gains at least 0.025 of R@10 or MRR in some city, or makes usable
   what was not (a hotel the planner can now offer, a district it can now fill).

The PR quotes the before and after table and the per-question misses that changed. A change that
fails the rule is not "an improvement with a regression": it waits until the regression is gone.

### Index noise and ENHANCED mode

Measured with the 120 questions, comparing S3 Vectors with exact search over the same vectors:

- The approximate search misses **5–9 %** of a question's exact top 10, and which neighbours it misses
  is fixed when the index is built. Within one index, results are deterministic. Across builds of
  the same vectors, a city moves by up to **±0.075 R@10 and ±0.11 MRR**, with **5–9 expected ids**
  leaving the top 10. That is the noise floor of any comparison between two builds.
- **ENHANCED mode** (filter first) against CLASSIC over the same vectors: no city loses and no
  expected id leaves its top 10; Budapest's January climate question goes from missing to #1.

| Mode | R@10 | MRR | Berlin | Bologna | Budapest | Los Angeles | Madrid | Miami |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| CLASSIC | 0.767 | 0.687 | 0.704 | 0.838 | 0.675 | 0.908 | 0.721 | 0.758 |
| ENHANCED | 0.776 | 0.695 | 0.704 | 0.838 | 0.725 | 0.908 | 0.721 | 0.758 |

- **Rewriting one city moves others.** Reindexing Los Angeles alone (6,778 vectors written, 465
  deleted) takes the index from the ENHANCED row above to the baseline: Berlin loses one expected id
  (the Checkpoint Charlie lead), Miami goes to 0.725 and Madrid gains one (El Rastro), with their
  vectors untouched. In ENHANCED mode a rewrite reshuffles the shared index, not only its own city:
  this is the build noise above, and the reason a change is gated on exact search.
- **The shared index costs recall.** The same corpus scores lower in the six-city `city-kb` than in a
  two-city index (Bologna R@10 0.762 against 0.838, Miami 0.725 against 0.775): filtered approximate
  search drops candidates, so compare a change only against a measurement taken in the same index.
- **Right after a reindex, the rewritten city's deleted vectors keep taking candidate slots**, so
  its searches return short lists (8 or 9 passages of 10). `ai_api` asks for 30 candidates and keeps
  the first 10, which removes them with no change in recall.

### Measured corpus changes

Corpus rebuilds measured against the corpus they would replace, as worked examples of the rule.

**Berlin cleaned and with Spanish leads** (33 off-topic Wikipedia articles out, 170 chain outlets
out, the Spanish lead of 181 articles added as unplaced prose), in a temporary index against
`city-kb`, with the same 20 questions and expected ids:

| Index | R@5 | R@10 | MRR | R@10 `en` (12) | R@10 `es` (8) |
|---|---:|---:|---:|---:|---:|
| `city-kb` (previous corpus) | 0.554 | 0.667 | 0.549 | 0.681 | 0.646 |
| rebuilt corpus | 0.554 | 0.692 | 0.515 | 0.722 | 0.646 |

- Recall@10 gains 0.025 and MRR loses 0.034: the Spanish leads take places in the top 10.
- The expected ids are English documents (twins must expect the same ids), so a Spanish lead of
  the right place is not counted. It reaches the top 10 for the Brandenburg Gate (the question
  goes from 0.50 to 1.00), the Jewish Museum and the Holocaust memorial; the memorial still scores
  0 on its English ids.
- One regression: July's climate in Spanish drops from 1.00 to 0.50. The DDR Museum question
  still misses.

Under the acceptance rule this change does not ship: MRR drops by more than the tolerance and the
July question leaves the top 10.

**Bologna and Miami through the hotel photo stage** (ADR 0022, the doubtful pictures curated by
hand), the old and the new corpus loaded one after the other into the same temporary index:

| City | R@5 | R@10 | MRR |
|---|---|---|---|
| Bologna, old → new | 0.713 → 0.725 | 0.838 → 0.838 | 0.881 → 0.881 |
| Miami, old → new | 0.683 → 0.683 | 0.775 → 0.775 | 0.738 → 0.738 |

No question loses an expected id. The one change is one Bologna id moving up from #6 to #5 (San
Luca).

**Los Angeles with four more districts** (Harbor, San Fernando Valley, Bunker Hill, Chinatown), on
exact search: R@5 0.842, R@10 0.908, MRR 0.725, identical before and after.

### Misses

Questions of the by-language run above with an expected id outside the top 10, with the rank of
each expected id (— = not in the top 10):

<details>
<summary>49 of 120 questions</summary>

- berlin/reichstag-dome (en) "how do i visit the reichstag dome": `wv:en:Berlin/Mitte#see:reichstagsgebaude` #4, `wp:en:15996587#s0-c1` #3, `wp:en:217577#s7-c1` #2, `wv:en:Berlin#section:see/tall-buildings-with-observation-decks:c1` —
- berlin/checkpoint-charlie (en) "is checkpoint charlie worth visiting": `wv:en:Berlin/East Central#see:checkpoint-charlie` #2, `wp:en:200989#s0-c1` —
- berlin/brandenburg-gate-es (es) "¿Qué historia tiene la Puerta de Brandeburgo?": `wv:en:Berlin/Mitte#see:brandenburg-gate` —, `wp:en:156604#s0-c1` #2
- berlin/tempelhof (en) "an old airport whose runways are now a huge public park": `wv:en:Berlin/Tempelhof and Neukölln#see:tempelhof-airport` #1, `wp:en:58103041#s0-c1` —, `wp:en:58103041#s7-c1` #8
- berlin/tempelhof-es (es) "un antiguo aeropuerto cuyas pistas ahora son un enorme parque público": `wv:en:Berlin/Tempelhof and Neukölln#see:tempelhof-airport` #1, `wp:en:58103041#s0-c1` —, `wp:en:58103041#s7-c1` #6
- berlin/fernsehturm (en) "the very tall tower with a shiny ball on top that you can see from all over the city, can you go up it?": `wv:en:Berlin/Mitte#see:fernsehturm` —, `wp:en:486313#s0-c1` —
- berlin/holocaust-memorial-es (es) "un monumento con miles de bloques de hormigón grises de distintas alturas cerca de la Puerta de Brandeburgo": `wv:en:Berlin/Mitte#see:memorial-to-the-murdered-jews-of-europe` —, `wp:en:806177#s0-c1` —
- berlin/friedrichshain-bars (en) "cheap bars for a night out in friedrichshain": `wv:en:Berlin/East Central#see:simon-dach-strae` —, `wv:en:Berlin/East Central#see:boxhagener-platz-and-surroundings` —, `wv:en:Berlin#section:drink/bars:c1` #7, `wv:es:Berlín#section:beber-y-salir:c1` —
- berlin/kids-bad-weather (en) "where to take a five-year-old when the weather is bad": `wv:en:Berlin/Mitte#see:aquarium` —, `wv:en:Berlin/Mitte#do:legoland-discovery-centre` —, `wv:es:Berlín#practical:legoland-discovery-centre` —
- berlin/vida-rda-es (es) "quiero ver cómo vivía la gente corriente en la Alemania comunista": `wv:en:Berlin/Mitte#see:ddr-museum` —, `wp:en:23251407#s0-c1` —, `wv:en:Berlin/East Central#see:museum-in-der-kulturbrauerei` —, `wp:en:52919946#s0-c1` —
- bologna/sette-chiese (en) "what are the sette chiese": `wp:en:31485205#s0-c1` #6, `wv:es:Bolonia#section:ver/otras-iglesias:c1` —
- bologna/san-luca (en) "the church up on a hill that you walk to under hundreds of arches": `wv:en:Bologna#see:sanctuary-of-san-luca` #1, `wv:en:Bologna#see:santuario-della-madonna-di-san-luca` —, `wv:es:Bolonia#see:santuario-della-madonna-di-san-luca` #6, `wp:en:12406037#s0-c1` #3
- bologna/salaborsa-ruins (en) "a library where you can look through the floor at ancient ruins": `wv:en:Bologna#see:scavi-romani-di-biblioteca-salaborsa` #1, `wv:es:Bolonia#see:scavi-romani-di-biblioteca-salaborsa` #4, `wp:en:30469250#s0-c1` —
- bologna/airport (en) "how do I get from the airport to the city centre": `wv:en:Bologna#section:get-in/by-plane:c1` —, `wv:es:Bolonia#section:llegar/en-avion:c1` —, `wp:en:3565861#s8-c1` —, `wp:en:35456265#s0-c1` —
- bologna/bus-tickets (en) "how do bus tickets work and where can I buy them": `wv:en:Bologna#section:get-around/by-bus:c1` —, `wv:es:Bolonia#section:desplazarse/en-autobus:c1` —
- bologna/tortellini-in-brodo (en) "where can I eat tortellini in brodo?": `wv:en:Bologna#eat:ristorante-diana` —, `wv:en:Bologna#eat:osteria-broccaindosso` #1, `wv:es:Bolonia#section:comer/area-central-norte:c1` —, `wv:es:Bolonia#section:comer/area-este:c1` —
- bologna/rainy-day-walk (en) "how can I explore the city without getting soaked when it rains?": `wv:en:Bologna#section:see/arcades:c1` #3, `wv:es:Bolonia#section:ver/arcadas:c1` #1, `wv:en:Bologna#section:see/porticoes-of-bologna:c1` —
- bologna/bike-tour (en) "is there a guided bike tour of the city?": `tour:bologna:bologna-welcome-bike-tour` —
- bologna/airport-es (es) "¿Cómo llego del aeropuerto al centro de Bolonia?": `wv:en:Bologna#section:get-in/by-plane:c1` #2, `wv:es:Bolonia#section:llegar/en-avion:c1` #1, `wp:en:3565861#s8-c1` #7, `wp:en:35456265#s0-c1` —
- bologna/rainy-day-walk-es (es) "¿Cómo recorrer la ciudad sin empaparse cuando llueve?": `wv:en:Bologna#section:see/arcades:c1` #6, `wv:es:Bolonia#section:ver/arcadas:c1` #4, `wv:en:Bologna#section:see/porticoes-of-bologna:c1` —
- budapest/szechenyi-plain (en) "szechenyi furdo city park pool": `wv:en:Budapest/Városliget#do:szechenyi-thermal-bath` #3, `wp:en:2613263#s0-c1` —
- budapest/ruin-bars (en) "ruin bars in the Jewish Quarter": `wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi` —
- budapest/public-transport (en) "how do metro and tram tickets work": `wv:en:Budapest#section:get-around/public-transport:c2` —
- budapest/zoo (en) "somewhere to take children on a rainy afternoon": `wv:en:Budapest/Városliget#see:budapest-zoo-and-botanical-garden` —, `wp:en:19905340#s0-c1` —
- budapest/clima-enero-es (es) "¿hace mucho frío en enero, nieva?": `om:climate:budapest:01` —, `wv:es:Budapest#section:comprender/clima:c1` —
- budapest/ruin-bars-es (es) "bares en ruinas en el barrio judío": `wv:en:Budapest/Erzsébetváros#drink:szimpla-kert-mozi` —
- budapest/zoo-es (es) "algo para hacer con niños una tarde de lluvia": `wv:en:Budapest/Városliget#see:budapest-zoo-and-botanical-garden` —, `wp:en:19905340#s0-c1` —
- los-angeles/griffith-observatory (en) "griffith observatory free entry? opening hours": `wv:en:Los Angeles/Northwest#see:griffith-observatory` #4, `wp:en:645747#s0-c1` —
- los-angeles/watts-towers (en) "the folk-art towers one immigrant built by hand out of scrap, broken tiles and seashells": `wv:en:Los Angeles/South#see:watts-towers-of-simon-rodia` —, `wp:en:409761#s0-c1` #3
- los-angeles/hollywood-bars (en) "best street in Hollywood for bar hopping at night": `wv:en:Los Angeles/Hollywood#section:drink/clubs-and-bars:c1` #1, `wv:en:Los Angeles/Hollywood#section:understand:c1` —
- los-angeles/kids-spaceship (en) "somewhere the kids can see a real ship that carried astronauts into orbit": `wv:en:Los Angeles/South#see:california-science-center` #4, `wp:en:2323711#s0-c1` —
- los-angeles/kids-spaceship-es (es) "un sitio donde los niños vean una nave de verdad que llevó astronautas al espacio": `wv:en:Los Angeles/South#see:california-science-center` #3, `wp:en:2323711#s0-c1` —
- los-angeles/downtown-walking-tour (en) "guided walking tour of downtown LA's historic buildings": `tour:los-angeles:historic-downtown` #1, `tour:los-angeles:art-deco-downtown` #5, `tour:los-angeles:broadway-theatre-district` —
- madrid/cocido-es (es) "¿dónde comer un buen cocido madrileño?": `wv:en:Madrid/La Latina-Austrias#eat:casa-lucio` —, `osm:node/8676589690` —, `osm:node/13830250001` —, `wv:es:Madrid#section:comer/comidas-tipicas:c1` #1
- madrid/ninos-lluvia-es (es) "algo para hacer con niños si llueve": `wv:en:Madrid/Arganzuela#see:planetario-de-madrid` —, `wv:en:Madrid/Chamberí-Castellana#see:museo-nacional-de-ciencias-naturales` —, `wv:en:Madrid/Northern Suburbs#see:museo-nacional-de-ciencias-naturales` —
- madrid/guernica (en) "Where can I see Picasso's Guernica?": `wv:en:Madrid/Retiro-Paseo del Arte#see:museo-nacional-centro-de-arte-reina-sofia` #4, `wv:es:Madrid#see:museo-reina-sofia` —, `wp:en:236833#s8-c1` #1
- madrid/ninos-lluvia (en) "something to do with the kids when it rains": `wv:en:Madrid/Arganzuela#see:planetario-de-madrid` —, `wv:en:Madrid/Chamberí-Castellana#see:museo-nacional-de-ciencias-naturales` —, `wv:en:Madrid/Northern Suburbs#see:museo-nacional-de-ciencias-naturales` —
- madrid/rastro (en) "rastro flea market sunday what time": `wv:en:Madrid/La Latina-Austrias#do:el-rastro` —, `wp:en:6853492#s0-c1` —, `wp:en:6853492#s2-c1` #2, `wp:en:6853492#s5-c1` #1
- madrid/twelve-grapes (en) "the square where crowds eat twelve grapes at midnight on New Year's Eve": `wv:en:Madrid/Sol-Letras-Lavapiés#see:puerta-del-sol` —, `wv:es:Madrid#see:puerta-del-sol` —, `wv:en:Madrid/Sol-Letras-Lavapiés#section:understand:c1` —
- madrid/romantic-sunset (en) "a romantic spot for a couple as the sky turns orange in the evening": `wv:en:Madrid/Moncloa#see:templo-de-debod` —, `wv:es:Madrid#see:templo-de-debod` —, `osm:node/10564500199` —
- miami/vizcaya (en) "vizcaya museum tickets price": `wv:en:Miami/Coconut Grove#see:vizcaya-museum-and-gardens` #4, `wv:es:Miami#see:vizcaya-museum-and-gardens` —, `wp:en:1426909#s0-c1` #3
- miami/domino-park (en) "domino park little havana": `wv:en:Miami/Little Havana#see:gomez-park` #1, `wv:es:Miami#see:gomez-park` —, `wp:en:77960053#s0-c1` #3
- miami/barnacle (en) "Barnacle Historic State Park opening hours and entry fee": `wv:en:Miami/Coconut Grove#see:barnacle-historic-state-park` —, `wp:en:4257589#s0-c1` —
- miami/miami-circle (en) "a ring of 2,000-year-old holes carved into the bedrock by Native Americans near the river mouth": `wv:en:Miami/Downtown#see:miami-circle` —, `wv:es:Miami#see:miami-circle` #8, `wp:en:1212613#s0-c1` #3
- miami/freedom-tower (en) "the 1920s newspaper building where refugees fleeing Castro's Cuba were processed in the 1960s": `wp:en:460921#s0-c1` —, `wp:en:460921#s1-c1` #1
- miami/kids-rain (en) "what can we do with the little ones when it's pouring outside?": `wv:en:Miami/Downtown#see:miami-children-s-museum` —, `wp:en:3947565#s0-c1` —, `wp:en:8854683#s0-c1` —
- miami/guarapo-es (es) "¿dónde puedo tomar un jugo de caña de azúcar?": `wv:en:Miami/Little Havana#drink:los-pinarenos-fruteria` #4, `osm:node/3793660495` —
- miami/airport-es (es) "¿cómo llego del aeropuerto de Miami al centro en transporte público?": `wv:en:Miami#section:get-in/by-plane:c1` #1, `wv:en:Miami#section:get-around/by-public-transit:c1` —
- miami/kids-rain-es (es) "¿qué hacer con los peques cuando cae un chaparrón?": `wv:en:Miami/Downtown#see:miami-children-s-museum` —, `wp:en:3947565#s0-c1` —, `wp:en:8854683#s0-c1` —

</details>

### Adding questions

One JSON object per line in `ai_api/data/eval_questions/<city>.jsonl` (`id`, `lang`, `query`,
`expected`, `why`); every city of the manifest has exactly 20 (`just test-ai` checks the count, the
8 Spanish ones, the 3 twins and that every planner city has its file). Pick the expected ids from
the city's `tools/city_corpus/data/<city>/documents.jsonl` by what answers the question (search
the entity's name, read the candidates), say how in `why`, and give a twin the id of its English
original plus `-es`. A new city gets its 20 in the PR that adds it, and `just eval-retrieval <city>`
right after `just index <city>` ([add-city runbook](../runbooks/add-city.md), steps 7 and 8). A
changed question changes the totals: record a new baseline rather than comparing across sets.

## Answers: groundedness and relevance

`just eval-answers [city]` (from a laptop with an AWS session; `--per-city N` for a cheap sample,
`--out file.jsonl` to keep every answer and verdict) runs `ai_api/application/answer_eval.py` (how
it works: the ai_api README, "Answer eval"). Each of the 120 questions above, plus 6 that no guide
answers (`ai_api/data/eval_unanswerable.jsonl`, one per city: today's exchange rate, tonight's
traffic, a live Uber price, a wifi password, a club queue, a pharmacy's hours), is answered exactly
as the planner answers a question in chat: the same 6 passages with the city filter, the same
prompt (`plan_trip.chat_messages`, shared with the planner), the production model. A judge model
then reads the question, the passages and the answer and grades:

- **groundedness** 1–5: is every claim supported by the passages? An invented specific (a place,
  price, time, address, figure) caps it at 2; general advice clearly flagged as such after saying
  the passages do not cover the question does not count against it;
- **relevance** 1–5: does it answer what was asked?
- **acknowledges_gap**: does it say the information is not available or cannot be confirmed?

**The judge is Amazon Nova Pro** (`eu.amazon.nova-pro-v1:0`, temperature 0): another family than
the answering Claude, so the model does not grade itself, at a quarter of a Sonnet's price. A whole
run costs about 0.6 USD and takes a few minutes. The report prints the judge prompt's version:
scores of two versions are not compared.

### Baseline

Answers by `eu.anthropic.claude-haiku-4-5-20251001-v1:0` over `travel-ai-vectors/city-kb`, judge
`eu.amazon.nova-pro-v1:0`, judge prompt `f7a13e321bf8`.
126 answers, no failure, no verdict needed a repair. Cost: answering 0.34 USD (216k tokens in,
25k out), judging 0.25 USD (285k in, 8k out).

| Set | Answers | Groundedness | Relevance | Either under 3 |
|---|---:|---:|---:|---:|
| **all** (answerable) | 120 | 4.72 | 4.98 | 4% |
| berlin | 20 | 4.60 | 4.95 | 5% |
| bologna | 20 | 4.85 | 4.95 | 0% |
| budapest | 20 | 4.65 | 5.00 | 5% |
| los-angeles | 20 | 4.95 | 5.00 | 0% |
| madrid | 20 | 4.70 | 5.00 | 5% |
| miami | 20 | 4.60 | 5.00 | 10% |
| lang `en` | 72 | 4.74 | 4.99 | 3% |
| lang `es` | 48 | 4.71 | 4.98 | 6% |

- **The 6 unanswerable questions: 6 of 6 answers say the information is not available** and send
  the traveller to a live source (XE or the bank, Google Maps, the venue). One still adds a figure
  the passages do not give: a taxi fare to South Beach of "30–60 $".
- **11 answerable questions (9 %) were turned down** ("I don't have that"): the children-on-a-rainy-day
  ones in Berlin and Miami, Szimpla Kert, January in Budapest, Bologna's bus tickets and bike tour,
  the Barnacle, Vizcaya in Spanish, the Holocaust memorial in Spanish, the Pergamon (closed: a
  correct gap). Almost all match the retrieval misses above: when the passages do not hold the
  answer, the model says so instead of inventing it.
- **The five worst answers** are the cases to fix: an invented figure (2,711 slabs of the Holocaust
  memorial: true, but not in the passages), a price in the wrong currency (Vizcaya, "€25" for
  "$25"), general advice presented as fact (Miami's rainy-day options, January snow in Budapest),
  and one the judge got wrong (cocido, below).

### Checking the judge by hand

Eleven verdicts were checked against their passages: the four worst of the list above, four
random 5/5 answers, the Pergamon, the January climate of Bologna and the Uber question. **8 of 11
agree.** The three disagreements:

- *cocido*: the judge marked the Cazorla restaurants, their addresses and prices as unsupported;
  they are in the Spanish Wikivoyage passage. Too harsh on groundedness (2 for a 4–5).
- *Uber price*: the answer gives a taxi fare the passages do not; the judge gave it 4. Too lenient.
- *romantic sunset* (Madrid): the retrieval missed the Templo de Debod and the answer suggests an
  arts centre under an overpass; grounded, but the judge gave relevance 5. Too lenient on relevance.

So read these scores as an upper bound, relevance most of all (4.98 leaves no room to move).
Agreement was not measured with κ; the memoria's proposed criterion (judge ≥ 4/5, κ ≥ 0.6 against
50 labelled answers) is met on the first half only.

### Running it from the admin console

`/admin/judge/` runs the same evaluation (**Grade the answers**) and the judge check below
(**Check the judge**) against the deployed index and models, streams each graded answer and keeps
every run for the table's 90 days, with each answer, verdict and unsupported claim
([ADR 0039](adr/0039-answer-judge-in-the-admin-console.md)). One run at a time.

A run on 2026-10-25 (same models, judge prompt `f7a13e321bf8`, the index after the ENHANCED
rebuild): 125 of 126 answered and graded, one failure (`budapest/public-transport`: the model gave
no usable answer). Groundedness **4.83**, relevance **4.97** over 119 answerable questions, one
under 3 (`miami/kids-rain`), 6 of 6 unanswerable ones acknowledged, 9 answerable ones turned down.
Its cost was not recorded: the script stopped while printing the report on a Windows console
(fixed since). The same run from the admin console minutes later answered all 126: groundedness
**4.79**, relevance **5.00**, 1 of 120 under 3, 6 of 6 acknowledged, 9 turned down, **0.59 USD** and
two minutes.

## The golden set: how far the judge can be trusted

`ai_api/data/eval_judge_golden.jsonl` holds **50 answers with the verdict the rubric gives them**.
Each case freezes the question, the passages exactly as the judge reads them and the answer, so
a check calls only the judge (`just eval-answers --golden`, or **Check the judge** in the admin):
0.10 USD and under a minute, the same whatever the index or the answering model do.

**What is in it.** All 50 come from the 2026-10-25 run above.

- **34 real answers.** They are stratified, not sampled at random, because almost every answer
  scores 5:
  - the 6 unanswerable questions;
  - the 9 answerable ones turned down;
  - every other answer the judge scored 3 or less, or under 5 in relevance;
  - 7 of the 14 scored 4 in groundedness;
  - the romantic-sunset question from the hand check above;
  - one 5/5 answer per city, and the rest at random.
- **16 perturbed copies** of other 5/5 answers, each with one known defect:

  | Defect | Cases |
  |---|---:|
  | An invented price, opening time, address or figure | 7 |
  | A wrong currency | 1 |
  | A contradiction of the passage | 2 |
  | The answer to another question | 2 |
  | A false "I don't have that" | 2 |
  | General claims not flagged as such | 1 |
  | A partial answer | 1 |

  Without them the expected scores would all be 5 and kappa could not be computed.

**How it was labelled.** Claude read every case against its passages and labelled it under the
judge's rubric, applied literally. A second, blind pass was then made by another model instance
from a shuffled file without origins or defects. Before reconciliation the two passes agreed on:

- groundedness: 45 of 50 exactly, weighted κ 0.98;
- relevance: 46 of 50, κ 0.97;
- the gap flag: 50 of 50.

The 8 disagreements were settled case by case, and `why` records each label. The labels are
therefore careful readings of the rubric, not independent human judgments. The team reviews them
before any figure is quoted as a human validation.

**Result: Nova Pro, judge prompt `f7a13e321bf8`.**

| Score | Exact | Within 1 | κ (quadratic) | Mean expected | Mean judge |
|---|---:|---:|---:|---:|---:|
| Groundedness | 56% | 82% | **0.61** | 3.72 | 4.04 |
| Relevance | 78% | 90% | **0.64** | 4.52 | 4.72 |

- **Either score under 3:** 80% agreement, κ **0.52**.
- **A second check from the admin console** gave κ 0.63, 0.66 and 0.57. Nova Pro at temperature
  0 is not fully deterministic, so read each κ as ±0.05.
- **Gap flag:** 100% as expected.
- **Every field as expected:** 44% of the real answers and 44% of the perturbed ones.

**Reading.**

- **Agreement.** It reaches the report's bar (κ ≥ 0.6) on both scores, barely, and not on the
  bad-answer line.
- **The judge is lenient on groundedness.** Its mean is 0.32 above the expected one, and the
  failures are the same kind of failure:
  - An invented price or time placed in parentheses is graded fully supported (Szimpla's entry
    fee and its hours).
  - So is a "meal included" that the passage's "show only" contradicts (Corral de la Morería).
  - When the judge does see an unsupported specific, it scores 4 instead of the rubric's cap of
    2: the Parliament's prices turned into euros in both languages, the "€€" of a bath, the
    invented height of the Reichstag dome.
- **It reads "an honest gap is relevant" too broadly.** Refusing a question the passages answer
  scores relevance 5 and 3, and an answer that never names the street asked for scores 5.
- **One verdict is too harsh.** It gives 1/3 to a rainy-day answer that flags its general advice,
  which the rubric does not count against it.
- **What it does well.** It catches every answer to another question and every contradiction (at
  2 rather than 1), and it never misreads the gap flag.

So the groundedness means above are an upper bound, and the number of bad answers is a lower
bound. The next change to the judge, a prompt that has it list each specific before scoring or a
stronger model, is measured on this set first.
