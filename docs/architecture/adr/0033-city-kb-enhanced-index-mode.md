# 0033 — `city-kb` filters before it searches (S3 Vectors ENHANCED mode)

**Status:** Accepted (amends 0014)
**Date:** 2026-10-19

## Context

Every search `ai_api` makes on the vector store carries a metadata filter: the city always, and for
the planner also districts, categories and price tiers. S3 Vectors created `city-kb` (2026-09-17) in
the only mode it then had, now called `CLASSIC`, which applies the filter *during* the approximate
nearest-neighbour search. On 2026-09-30 AWS added `ENHANCED`, which applies the filter first and
searches only the vectors that match. Buckets created before that date can hold either mode, and an
existing index switches in place with `UpdateIndexMode`, without re-ingestion and at no charge.

The retrieval eval (`docs/architecture/rag-evaluation.md`) showed recall moving with the index's state,
not with the corpus. An investigation on 2026-10-19 (TRA-308) measured it:

- The approximate search misses 5–9 % of each question's exact top 10, and *which* neighbours it
  misses is fixed when the index is built. Two builds with the same vectors differ by up to ±0.075
  R@10 and ±0.11 MRR per city, with 5–9 expected ids leaving the top 10. Within one index, results
  are deterministic.
- `CLASSIC` adds a second, smaller loss on filtered searches: in production 21 of the 120 eval
  questions received 8 or 9 passages instead of 10.

## Decision

`city-kb` runs in `ENHANCED` mode, switched on 2026-10-19 at 21:08 (Europe/Madrid) with the CLI:

```bash
aws s3vectors update-index-mode --vector-bucket-name travel-ai-vectors \
  --index-name city-kb --index-mode ENHANCED
```

Nothing else changed: no code, no vectors, no permission (the Lambda's `QueryVectors` grant covers both
modes). Measured on production with the 120 eval questions, before and after the switch, as `ai_api`
queries (no `queryMode` override):

| | R@10 | MRR | Budapest R@10 / MRR | Other cities |
|---|---:|---:|---|---|
| CLASSIC | 0.767 | 0.687 | 0.675 / 0.466 | — |
| ENHANCED | **0.776** | **0.695** | **0.725 / 0.516** | unchanged |

No city loses and no expected id leaves its top 10, so the change passes the acceptance rule of
`rag-evaluation.md`. A planner-shaped probe (city + category filter) goes from R@10 0.722 to 0.732.
Latency is unchanged (115–130 ms median) and ENHANCED has no extra charge.

Before the switch, every filter shape the planner sends (city; districts + sights; districts + sleep;
eat and drink; bounding box) was dry-run with `queryMode=ENHANCED` and answered without errors.

## Consequences

- Good: filtered searches no longer lose results to the filter, and every page is full.
- Good: reversible in one command, because the bucket predates 2026-09-30:
  `aws s3vectors update-index-mode … --index-mode CLASSIC`.
- **Terraform does not manage the mode.** The pinned AWS provider has no `index_mode` argument on
  `aws_s3vectors_index`, so a plan neither reverts nor replaces the index. However, an index *recreated*
  by Terraform (a change to dimension, metric or the non-filterable keys) comes back in the bucket's
  default mode. After any replacement, run the command above before `just index`. `infra/aws/vectors.tf`
  says so beside the resource.
- ENHANCED rejects a query with more than 100 filter constraints (each `$in` value counts). The largest
  planner filter today is Budapest's 20 districts with its categories, about 30. A city with many more
  districts would need a guard in the retriever's filter builder.
- It does not remove the build-to-build noise: that comes from the approximate search itself. So a
  corpus change is gated on exact search over the embeddings, not on two index builds (see
  `rag-evaluation.md`, "Accepting a change").

**Not done, and when to revisit:**

- Over-fetching `topK = 30` and keeping the first 10 adds Miami +0.017 R@10 (+0.002 overall). It needs a
  code change and a deploy, which was not worth it a week before the TFM delivery. **Done in TRA-310**
  after all: right after the Los Angeles reindex, the rewritten city's deleted vectors gave short lists
  (Downtown sights 7 of 10, 6 of LA's 20 questions with 8 or 9 passages), and 30 candidates refill them.
- Exact in-process search (one float32 matrix per city, about 137 MB for the six cities, ~1 ms per query)
  is the only way to make retrieval deterministic and reach the exact ceiling (R@10 0.783). It would turn
  S3 Vectors into the document store rather than the search, and would amend 0014. Revisit when the
  corpus nears the ~50 k documents that 0014 names as its trigger (33.5 k today).
