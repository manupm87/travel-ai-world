# AGENTS.md — vector_store_bench

Read [`src/backend/AGENTS.md`](../../AGENTS.md) first; what this measures and how to run
it is in [README.md](README.md).

## Rules

- **This is a spike**: throwaway code with real numbers. Never import it from a service,
  and never let a service import it. When TRA-151 closes, the package goes or freezes.
- **Do not touch `services/ai_api/**`.** The comparison decides which adapter goes behind
  the existing `Retriever` port; TRA-152 owns that code. The spike's own Terraform lives in
  `infra/aws/spikes/vector-store/` with local state and never edits the main stack.
- **Both candidates get the same vectors**: same model, dimensions and normalisation
  (README). If that ever diverges, the comparison is void.
- **Measured, not estimated.** Every number in the report comes from a committed CSV in
  `results/`. Say where a number came from, including the conditions (memory size, cold or
  warm, Region).
- **Name the caveats**: the in-process Qdrant is exhaustive, not approximate; the eval set
  was seeded with BM25 candidates; latency includes the embedding call. A spike that hides
  these is worth nothing.
- Tests never touch the network: fixtures and in-memory stores only.
- The stack costs money while it exists. Destroy it after measuring and say so in the report.
