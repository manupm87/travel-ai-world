# RAG evaluation

What we measure about the planner's retrieval-augmented answers, how to run it, and the numbers
so far. Umbrella issue: TRA-148. Two measurements, compared before and after a change:

1. **Retrieval** — recall@k and MRR of the deployed index over a fixed question set (TRA-263,
   TRA-272, below).
2. **Answers** — groundedness and relevance of the planner's answers to the same questions,
   graded by an LLM judge (TRA-266, below).

## Retrieval: recall@k and MRR

**Run evaluation** in the admin console (`/admin/quality/`, TRA-273: every city, no credentials
needed) or `just eval-retrieval [city]` from a laptop with an AWS session run the same
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

### Baseline, 2026-10-01

Index `travel-ai-vectors/city-kb` (eu-west-1) as loaded in production that day, six cities;
embeddings `amazon.titan-embed-text-v2:0` (1024 dimensions); code at `main` `1c2ce1f` plus
TRA-272; top 10 with the city filter. Every expected id is in the index.

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

The twins ask the same thing in both languages with the same expected ids (computed once from a
second run of the same set, not printed by the script):

| Subset | Questions | R@5 | R@10 | MRR |
|---|---:|---:|---:|---:|
| Twins, English | 18 | 0.546 | 0.620 | 0.519 |
| Twins, Spanish | 18 | 0.528 | 0.644 | 0.644 |

### Reading

- **recall@10 is 0.726**, under the 0.75 the memoria proposes. The first baseline (49 questions,
  Budapest and Madrid, same day) gave 0.760: the new cities and harder questions (descriptive
  places, intents) bring it down, Berlin (0.667) and Budapest (0.675) most.
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
    public-transport chunk of Budapest, January's climate in Budapest);
  - **one answer among many equal listings** (Szimpla Kert for "ruin bars", the restaurants that
    serve cocido, Friedrichshain's bars).

  These are the cases TRA-269 (hybrid BM25 + RRF, MMR) would target; this run is its baseline.

History: the first baseline (TRA-263, 49 questions: the spike's 32 Budapest queries, 6 Spanish
twins and 11 Madrid questions) gave R@5 0.651, R@10 0.760, MRR 0.617; on the spike's own 32
queries, 0.781 against 0.812 in the spike (its own S3 Vectors index, the 2026-09-17 corpus, no
filter). TRA-272 replaced it with the 20-per-city set.

### Misses, 2026-10-01

Questions with an expected id outside the top 10, with the rank of each expected id (— = not in
the top 10):

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

### Baseline, 2026-10-01

Answers by `eu.anthropic.claude-haiku-4-5-20251001-v1:0` over `travel-ai-vectors/city-kb`, judge
`eu.amazon.nova-pro-v1:0`, judge prompt `f7a13e321bf8`; code at `main` `8b35b72` plus TRA-266.
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

On 2026-10-01 eleven verdicts were checked against their passages (by Claude while building this;
a person of the team should repeat it on another ten): the four worst of the list above, four
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
