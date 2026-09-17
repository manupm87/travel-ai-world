# Vector store spike — Qdrant as a Lambda vs Amazon S3 Vectors

**Status:** measured (TRA-151), 2026-09-17.
**Corpus:** the committed Budapest corpus, 6,082 documents (TRA-138, TRA-139, TRA-154).
**Recommendation:** keep **Amazon S3 Vectors** ([ADR 0014](adr/0014-vector-store-s3-vectors.md)).
Qdrant-as-a-Lambda works and is three times faster warm, but it buys latency nobody
feels at the price of an image to build, a 1.8 s cold start and a store to operate.

Input for ADR 0012 (TRA-137) and a cross-check of ADR 0014, which chose S3 Vectors before
this spike ran. Both candidates were built for real; nothing below is estimated except
the monthly costs.

## Candidates

| | A — Qdrant as its own Lambda | B — Amazon S3 Vectors |
|---|---|---|
| What it is | The official `qdrant/qdrant` binary behind the Lambda Web Adapter, the collection baked into the image and unpacked into `/tmp` at each cold start | A managed API in the account, queried with boto3 |
| Auth | Function URL with `AWS_IAM`, SigV4 from the caller | IAM, the caller's own role |
| Search | Dense, and sparse/hybrid server-side if wanted | Dense only; keyword search has to happen in process |
| Reindex | Rebuild and push a 125 MB image | `PutVectors` from a laptop: 6,082 vectors in 14 s |
| Local dev | The same binary in Compose | No emulator |

Discarded before measuring: `pgvector` on RDS (private subnet, unreachable from `ai_api`),
Qdrant Cloud free (third party, static key, public endpoint, suspended when idle), Qdrant
on Fargate (doubles the monthly bill). TRA-151 has the long version.

## Method

- **The same vectors on both sides.** `amazon.titan-embed-text-v2:0`, 1024 dimensions,
  `normalize=true`, embedding each document's `text` verbatim; Titan rejects an
  `inputType` key (a Cohere parameter) and is deterministic — re-embedding a query
  returns a bit-for-bit identical vector, which is what makes the comparison fair. The
  corpus was embedded once (576,046 input tokens, $0.012) into an artefact carrying the
  sha256 of the corpus and of the vectors; both stores were filled from it.
- **Evaluation set**: 32 queries, 4 of them in Spanish over English documents, 52 expected
  `doc_id`s — `src/backend/tools/vector_store_bench/eval/budapest-queries.jsonl`. Several
  are phrased with no keyword overlap on purpose. It seeds TRA-148.
- **Ground truth**: exhaustive cosine over all 6,082 vectors with numpy.
- **Latency**: measured by a bench Lambda in `eu-west-1`, outside any VPC, one request per
  execution environment — the same shape `ai_api` runs in. 128 warm queries per candidate
  and memory size; cold starts forced by replacing the execution environment.
- Raw numbers: `src/backend/tools/vector_store_bench/results/*.csv`.

## Quality (measured)

Top-k = 10, 32 queries. "Agreement" is the share of exhaustive search's top 10 that the
store returns — what AWS quotes for S3 Vectors as "90%+ average recall".

| Strategy | recall@5 | recall@10 | MRR | Agreement |
|---|---|---|---|---|
| Exhaustive cosine (numpy) | 0.688 | 0.812 | 0.591 | — |
| **B — S3 Vectors (deployed)** | **0.688** | **0.812** | 0.591 | **0.969** |
| **A — Qdrant on Lambda (deployed)** | 0.672 | 0.797 | 0.591 | 0.963 |
| BM25 only (in process) | 0.578 | 0.646 | 0.505 | 0.353 |
| Exhaustive + BM25, RRF | 0.693 | 0.760 | **0.651** | 0.644 |

- **The two stores are indistinguishable in quality.** Both agree with exhaustive search
  about 96–97% of the time, and the difference between them is one document in one query.
  The store is not where retrieval quality is won.
- **Hybrid trades coverage for precision**: fusing BM25 raises MRR (0.591 → 0.651) and
  recall@5 slightly, but costs recall@10 (0.812 → 0.760). For cards, where the first few
  matter, hybrid is worth it; for feeding the model context, dense alone retrieves more.
  This can be done in process for either candidate, so it does not decide the store.
- **Keyword search alone is not enough**: it misses the queries with no shared vocabulary
  ("somewhere to take children on a rainy afternoon" → the zoo).

## Latency (measured)

Milliseconds. `embed` is the Titan call, identical for both. `search` is the store.

| Candidate | Memory | Phase | search p50 | search p95 | total p50 |
|---|---|---|---|---|---|
| A — Qdrant | 2048 | warm | **21.5** | 27.1 | 93.5 |
| A — Qdrant | 1024 | warm | 22.5 | 29.3 | 97.7 |
| A — Qdrant | 2048 | **cold** | **1959** | — | 2054 |
| A — Qdrant | 1024 | **cold** | **1717** | — | 1824 |
| B — S3 Vectors | 2048 | warm | 64.2 | 69.1 | 136.9 |
| B — S3 Vectors | 1024 | warm | 66.5 | 152.3 | 140.1 |
| B — S3 Vectors | 2048 | cold | 91 | — | 189 |
| B — S3 Vectors | 1024 | cold | 288 | — | 387 |

- **Warm, Qdrant is three times faster** (22 ms against 65 ms), and inside the container a
  search takes about 3 ms: the rest is the network and the Function URL. But the whole
  query costs ~94 ms for A and ~137 ms for B, because **the embedding call (~75 ms)
  dominates both**, and both disappear next to the seconds an LLM answer takes.
- **Cold, the order reverses**: A pays 1.7–2.0 s to unpack and open the collection; B has
  no cold start of its own (its "cold" row is just the bench's). At demo traffic most
  queries hit a cold environment, so A's typical latency in practice is the bad one.
- **Memory**: the Qdrant container uses 582 MB of its 2048 MB after the tuning below.

### What the tuning bought (candidate A)

The first build used Qdrant's defaults and copied a directory tree:

| | Before | After |
|---|---|---|
| Cold at 1024 MB | 3116 ms | 1717 ms |
| Cold at 2048 MB | 3233 ms | 1959 ms |
| Memory used | 1012 MB (of 1024) | 582 MB |
| Segments | 13 | 2 |

Two changes: build the collection with `default_segment_number=1` (the optimizer settles
at 2) and ship it as a tar that the entrypoint unpacks with one sequential read. The
memory halved as a side effect — the gigabyte was thirteen open segments, not Qdrant
overhead. Qdrant cannot read from a read-only directory
([qdrant/qdrant#3321](https://github.com/qdrant/qdrant/issues/3321)), so the unpacking
into `/tmp` is unavoidable while we use the official binary.

## Cost

List prices, us-east-1 (AWS does not publish S3 Vectors prices per Region); eu-west-1 is
within a few percent. Both candidates pay the same Titan embedding, $0.02 per million
input tokens — about $0.002 per 100k queries.

| Queries per month | A — Qdrant Lambda | B — S3 Vectors |
|---|---|---|
| 1,000 | ~$0.07 | ~$0.005 |
| 10,000 | ~$0.08 | ~$0.03 |
| 100,000 | ~$0.09 | ~$0.25 |

- **A**: 4 ms of billed duration per warm query at 2 GB, plus **1.8 s of billed init per
  cold environment** — which at demo traffic is most queries — plus $0.0125/month of ECR
  storage for the 125 MB image.
- **B**: $2.50 per million queries, $0.06 per GB-month for about 31 MB of vectors and
  metadata, and writes at $0.20/GB (the whole corpus costs under a cent to load).
- Both are rounding errors against the 30 €/month budget of ADR 0009. **Cost does not
  decide this.**

## Privacy and operations

| | A — Qdrant | B — S3 Vectors |
|---|---|---|
| What leaves the account | Nothing | Nothing |
| Secrets | None (SigV4) | None (IAM) |
| Moving parts | Image, ECR repository, function, Function URL, IAM on both sides | An index |
| Reindex | Rebuild and push 125 MB, redeploy | One command, 14 s |
| Failure seen while building it | An image that shipped an empty collection and reported success | None |
| Dev parity | The same binary in Compose | Needs AWS, or a fake adapter |

## Recommendation

**Stay on S3 Vectors.** Quality is the same, the cost difference is cents, and the latency
advantage of Qdrant (43 ms per query, warm) is invisible next to an LLM answer while its
1.8 s cold start is visible. What decides it is operations: B is an index and one command;
A is an image, a registry, two IAM policies and a store whose collection must be rebuilt
and redeployed on every corpus change — and which silently shipped an empty collection
three times during this spike until the build was made to check itself.

Revisit A if one of these becomes true:

- Retrieval moves to genuinely hybrid search and in-process BM25 stops being enough (A
  does dense + sparse with server-side fusion; B is dense only).
- The corpus grows enough that 65 ms per query starts to matter, or queries become
  frequent enough that Qdrant's warm path pays for its cold starts.
- Filtering needs more than S3 Vectors' metadata filters (no geo filter: a bounding box
  has to be expressed as four comparisons on `lat`/`lon`).

### What to change in the tickets

- **TRA-137 (ADR 0012)**: drop Qdrant; the knowledge base is stored in S3 Vectors per
  ADR 0014, and this document is the evidence. Add the `tour` category and `tour_type`
  (TRA-154) to the payload schema.
- **TRA-140** (Titan embedder, Qdrant retriever, `index` command, Qdrant in Compose):
  close as superseded by TRA-152, which does the same against S3 Vectors. Keep from it the
  hybrid part: BM25 + RRF in process, worth it for the cards (MRR 0.591 → 0.651).
- **TRA-141** (Qdrant Cloud in production): close; the store is Terraform-managed in the
  main stack already (TRA-155).
- **TRA-148**: reuse `eval/budapest-queries.jsonl` and these numbers as the first baseline.

## Housekeeping

The throwaway stack (`infra/aws/spikes/vector-store/`) held its own ECR repository, two
Qdrant functions, two bench functions, an S3 bucket and its own S3 Vectors index, all
tagged `spike=vector-store`. It never touched the main stack's index. **Still up as of
2026-09-17 22:45 UTC**; this line is replaced with the date of the `terraform destroy`
before the pull request is merged. The local state file stays in the working copy and is
never committed.

The bench package stays in the repository as the origin of these numbers, and because
`eval/` and the embeddings artefact are reused by TRA-148 and TRA-152.
