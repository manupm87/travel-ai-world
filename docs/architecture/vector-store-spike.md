# Vector store spike — Qdrant as a Lambda vs Amazon S3 Vectors

**Status:** in progress (TRA-151). Quality measured; latency and cost pending the
throwaway stack.
**Corpus:** the committed Budapest corpus, 6,082 documents (TRA-138, TRA-139, TRA-154).

Input for ADR 0012 (TRA-137) and a cross-check of
[ADR 0014](adr/0014-vector-store-s3-vectors.md), which already chose S3 Vectors for the
deployed path. This document measures the alternative rather than arguing about it.

## Candidates

| | A — Qdrant as its own Lambda | B — Amazon S3 Vectors |
|---|---|---|
| Where | Our account, outside the VPC | Our account, a managed API |
| Auth | Function URL with `AWS_IAM`, SigV4 from the caller | IAM, the function's own role |
| Search | Dense + sparse, fusion server-side if wanted | Dense only; keyword search has to happen in process |
| Cold start | Copies the collection into `/tmp` and loads it | None to pay for |
| Reindex | Rebuild and push the image | `PutVectors` from a laptop |
| Local dev | The same binary in Compose | No emulator |

Discarded before measuring, with reasons: `pgvector` on RDS (private subnet,
unreachable from `ai_api`), Qdrant Cloud free (third party, static key, public endpoint,
suspended when idle), Qdrant on Fargate (doubles the monthly bill). The long version is
in TRA-151.

## Method

- **Same vectors on both sides.** `amazon.titan-embed-text-v2:0`, 1024 dimensions,
  `normalize=true`, embedding each document's `text` verbatim. Titan V2 rejects an
  `inputType` key, so queries and documents are embedded identically. The corpus was
  embedded once (576,046 input tokens, about $0.012) into an artefact carrying the sha256
  of both the corpus and the vectors.
- **Evaluation set**: 32 queries, 4 of them in Spanish over English documents, with 52
  expected `doc_id`s — `src/backend/tools/vector_store_bench/eval/budapest-queries.jsonl`.
  Several are phrased with no keyword overlap on purpose ("somewhere to take children on a
  rainy afternoon" → the zoo). It seeds TRA-148.
- **Ground truth**: exhaustive cosine over all 6,082 vectors with numpy, which is what the
  approximate stores are compared against.
- **Latency** is measured from a bench Lambda in `eu-west-1`, outside any VPC, so the
  numbers include the network path an answer really pays.

## Quality (measured)

`src/backend/tools/vector_store_bench/results/quality.csv`, top-k = 10:

| Strategy | recall@5 | recall@10 | MRR | Agreement with exact @10 |
|---|---|---|---|---|
| Exact dense (numpy) | 0.688 | **0.812** | 0.591 | — |
| BM25 only | 0.578 | 0.646 | 0.505 | 0.353 |
| Exact dense + BM25 (RRF) | **0.693** | 0.760 | **0.651** | 0.644 |
| Qdrant dense (in process) | 0.688 | 0.812 | 0.591 | 1.000 |
| Qdrant dense + BM25 (RRF) | 0.693 | 0.760 | 0.651 | 0.644 |

Reading:

- **Hybrid trades coverage for precision.** Fusing BM25 raises MRR (0.591 → 0.651) and
  recall@5 slightly, but costs recall@10 (0.812 → 0.760): keyword hits push documents that
  merely share words. For cards, where the first five matter, hybrid wins; for feeding the
  model context, dense alone retrieves more of what was expected.
- **Keyword search alone is not enough**: 0.578 recall@5, and it agrees with exact dense
  only a third of the time, which is the queries with no shared vocabulary.
- **Caveat**: `qdrant-client` in process searches exhaustively, with no HNSW, which is why
  it matches exact search exactly. It sets the ceiling; Qdrant's approximate recall needs
  the real binary on Lambda.
- **Caveat**: candidates for the evaluation set were found with BM25 over the corpus, so
  the set may lean slightly towards documents keyword search can reach.

## Latency (pending)

Needs the throwaway stack (`infra/aws/spikes/vector-store/`): cold and warm, p50/p95 over
the evaluation set, split into embed and search, at 1024 MB and 2048 MB for candidate A.

## Cost (pending)

At 1k, 10k and 100k queries a month, eu-west-1 list prices, including storage and the
cost of reindexing.

## Recommendation (pending)

Written once the numbers above exist, together with the exact changes to make in
TRA-137 / TRA-140 / TRA-141.

## Housekeeping

The spike stack is applied by hand and destroyed after measuring; this section will say
on which date.
