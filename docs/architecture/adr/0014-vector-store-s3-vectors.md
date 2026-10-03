# 0014 — The vector store is Amazon S3 Vectors, filled from the committed corpus

**Status:** Accepted (the chat it first served, `StreamChat`, is retired by [0027](0027-retire-chat-v1.md); the planner searches the store)
**Date:** 2026-09-17

Decided with the bucket and the index (TRA-155); the retriever that reads them is TRA-152.
This ADR covers **where the vectors live**; the knowledge base itself (what a document is, how the
corpus is built) is ADR 0012, a number kept free for TRA-137.

## Context

`StreamChat` has accepted a `Retriever` since the chat was written and nothing implements it, so
answers come from the model's own knowledge. The corpus exists now — 6,082 Budapest documents
committed as JSONL under `src/backend/tools/city_corpus/data/` (TRA-138, TRA-139, TRA-154) — and it
needs somewhere to be searched from.

Forces:

- `ai_api` runs **outside the VPC** and RDS is private ([ADR 0009](0009-lambda-cognito-budget.md)),
  so the `pgvector` database of TRA-123 is unreachable without moving the function into the VPC and
  paying for interface endpoints.
- The budget is 30 €/month for the whole backend, most of it already spent on RDS.
- Manuel's second criterion is privacy: **as little as possible leaves the account**. A question
  and its embedding are user content.
- Whatever we pick has to be reproducible from the repository: the corpus is committed, so the
  index must be rebuildable by one command.

Options weighed (TRA-151 has the long version):

| Option | Why not |
|---|---|
| `pgvector` on RDS (TRA-123) | Private subnet, unreachable from `ai_api`. |
| Qdrant Cloud free tier | Third party, static API key in the function's environment, public endpoint that cannot be restricted to us (no fixed egress IP), suspended after an idle week. |
| Qdrant on ECS Fargate | ~16 €/month exposed, ~30 €/month done privately. Doubles the bill. |
| Qdrant as its own Lambda, snapshot in S3, Function URL with IAM auth | Viable and private; more moving parts (image, snapshot, SigV4 client). Manuel measures it (TRA-151) and we compare. |

## Decision

**Amazon S3 Vectors**, in `eu-west-1` like the rest of the stack.

1. **Terraform owns the store** (`infra/aws/vectors.tf`): one vector bucket
   `travel-ai-vectors` and one index `city-kb` — `float32`, **1024 dimensions**, **cosine**. No
   resource is ever created by hand or by the application.
2. **Embeddings are Titan Text Embeddings V2** (`amazon.titan-embed-text-v2:0`), asked for 1024
   dimensions and normalised, which is what cosine expects. It is multilingual, so a Spanish
   question matches English Wikivoyage prose, and it is the same model TRA-140 uses on Qdrant, so
   the two candidates stay comparable.
3. **Metadata is split once, at creation.** An index freezes its list of non-filterable keys (ten
   maximum), so it holds seven: `text`, `doc_id`, `name`, `url`, `source_url`, `heading_path` and
   `extra`, a JSON string with the optional fields a card may want (images and their licence,
   address, hours, price, tour data). Everything queries filter on — `city`, `category`,
   `district`, `kind`, `lang`, `source`, `price_tier`, `lat`, `lon` — stays filterable and
   measures 185 B in the worst document, well inside the 2 KB budget. New display fields go into
   `extra` and need no new index.
4. **The vector key is `uuid5(NAMESPACE_URL, doc_id)`**, not the `doc_id`: 1,357 of ours carry
   accents (`wv:en:Andrássy út#...`). The `doc_id` travels in the metadata; the key stays ASCII,
   stable and idempotent, which is also what TRA-140 does with Qdrant point ids.
5. **The function only reads.** Its role may `QueryVectors`, `GetVectors` and `GetIndex` on that
   one index and `InvokeModel` on the embeddings model alone. Indexing runs from a laptop
   (`just index`) with the operator's SSO session, against the same committed JSONL.
6. **`RETRIEVAL_ENABLED` gates it.** With the flag off the chat behaves exactly as before, which
   is how it ships until an index holds a corpus.

## Consequences

Good: nothing leaves the account and there is no key and no endpoint to protect — access is IAM,
audited in CloudTrail. The cost is noise: ~25 MB of vectors and ~7 MB of metadata, about 0.01 USD
of embeddings per full reindex, and queries priced per thousand. Rebuilding is one command against
a corpus that lives in git.

Bad, and accepted for now:

- **Dense search only.** There is no BM25 and no server-side fusion, so exact proper nouns
  ("Szimpla Kert") rest on the embedder. If recall proves too low, BM25 can be built at index time
  and fused in-process with RRF — the retriever's contract does not change.
- **No geo filter.** Radius search becomes a bounding box on the filterable `lat`/`lon`.
- **No local emulator.** Tests stub the boto3 client; running retrieval locally points at the real
  index over an SSO session.
- **The ANN recall is undisclosed** (AWS documents 90%+ on average). TRA-151 measures ours against
  an exact brute-force baseline.
- Dimension, metric and the non-filterable key list are frozen: changing one replaces the index and
  costs a reindex (minutes, ~0.01 USD).

Revisit when TRA-151's numbers land, if recall on names proves too low, or when the corpus grows
past a few cities (~50k documents) and query cost or latency stops being noise.
