# Vector store bench (TRA-151)

Measures two candidates for the chat's retrieval on the committed Budapest corpus:

- **A — Qdrant as its own Lambda**: the official binary behind the Lambda Web Adapter,
  collection baked into the image and copied into `/tmp` at each cold start, reached
  through a Function URL with `AWS_IAM`.
- **B — Amazon S3 Vectors**: the bucket and index the main stack already owns
  ([ADR 0014](../../../../docs/architecture/adr/0014-vector-store-s3-vectors.md)).

Throwaway by design; the numbers it produces live in
[`docs/architecture/vector-store-spike.md`](../../../../docs/architecture/vector-store-spike.md).
The evaluation set is meant to outlive it (it seeds TRA-148).

## The one contract both candidates share

Same corpus, same vectors: `amazon.titan-embed-text-v2:0`, **1024 dimensions**,
`normalize=true`, embedding the document's `text` verbatim. Titan V2 rejects an
`inputType` key (that is a Cohere parameter), so queries and documents are embedded
identically. Anything else and the comparison measures the embeddings, not the store.

## Commands

```bash
# 1. Embed the corpus once (~576k tokens, about $0.012, 11 min). Needs `just aws-login`.
uv run python -m vector_store_bench -v embed
#    → .artifacts/budapest/{vectors.npy,ids.json,manifest.json}

# 1b. Or take the vectors someone already produced (checksum-verified on arrival):
uv run python -m vector_store_bench pull-artifact --bucket "$(terraform -chdir=../../../../infra/aws/spikes/vector-store output -raw artifacts_bucket)"

# 2. Quality: recall@5, recall@10, MRR, agreement with exact search. No AWS stack needed.
uv run python -m vector_store_bench -v quality      # → results/quality.csv

# 3. Latency, once the spike stack is applied (see infra/aws/spikes/vector-store/README.md).
uv run python -m vector_store_bench -v latency      # → results/latency.csv
```

## What is committed and what is not

`vectors.npy` is 24 MB of float32 that gzip cannot shrink, and git keeps every version of
a binary whole: committing it would roughly double the repository on the first commit and
add another 22 MB per reindex, forever. It stays out. In the repository:

| File | Size | Why |
|---|---|---|
| `.artifacts/<city>/manifest.json` | 4 KB | The contract plus the sha256 of the corpus and of the vectors: anyone can prove they generated the same matrix |
| `.artifacts/<city>/query_vectors.npy` | 132 KB | The 32 evaluation queries embedded, in the order of `eval/budapest-queries.jsonl`, so results can be re-scored without calling Bedrock |
| `results/*.csv` | KB | The numbers the report quotes |

The matrix itself lives in the spike's S3 bucket while the spike runs:

```bash
bucket=$(terraform -chdir=../../../../infra/aws/spikes/vector-store output -raw artifacts_bucket)
uv run python -m vector_store_bench push-artifact --bucket "$bucket"
```

`pull-artifact` fails loudly if the downloaded matrix does not match the manifest, which is
how we know both candidates were filled from the same vectors. Regenerating is always an
option: Titan is deterministic, so `embed` reproduces the same file for $0.012.

## Layout

```text
vector_store_bench/
├── corpus.py       the TRA-138 contract, mirrored (no city_corpus import)
├── embedder.py     Titan V2 over Bedrock, with retries
├── artifact.py     vectors.npy + ids.json + manifest with checksums
├── search.py       exact cosine (numpy), BM25 with accent folding, RRF fusion
├── metrics.py      recall@k, MRR, agreement with exact search
├── quality.py      every strategy scored over the evaluation set
├── latency.py      drives the bench Lambda, writes percentiles
└── stores/         qdrant_store.py (in process, Compose or Function URL)
eval/budapest-queries.jsonl   32 queries, 4 in Spanish, 52 expected doc_ids
qdrant_lambda/                image of candidate A (Dockerfile, entrypoint, loader)
bench_lambda/                 the function that times both candidates inside AWS
results/                      committed CSVs the report quotes
```

## Reading the quality numbers

`qdrant dense` in `results/quality.csv` agrees with exact search 100 %: the in-process
mode of `qdrant-client` searches exhaustively, with no HNSW. It fixes the ceiling, not
Qdrant's approximate recall — that one only comes from the real binary on Lambda.
