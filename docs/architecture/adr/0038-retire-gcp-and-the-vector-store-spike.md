# 0038 — Retire `infra/gcp` and the vector store spike

**Status:** Accepted
**Date:** 2026-10-25

## Context

[ADR 0007](0007-aws-cloud-and-auth.md) kept `infra/gcp/` as a documented alternative cloud, and
[ADR 0028](0028-retire-the-legacy-scraper.md) kept `infra/gcp/` and `tools/vector_store_bench`
by team decision. A repository audit found that neither earns its place any more:

- `infra/gcp/` deploys a Postgres-backed `core_api` on Cloud SQL. Since
  [ADR 0023](0023-dynamodb-data-store.md) the service only speaks DynamoDB, so the GCP shape
  validates in CI but cannot run the current code. It still costs a CI matrix leg, a branch of the
  backend deploy workflow, four GitHub secrets and a second cloud in every infrastructure doc.
  The only thing the project uses from Google Cloud is the **Google OAuth client**, created by
  hand in the console and never in Terraform.
- `tools/vector_store_bench/` and `infra/aws/spikes/vector-store/` produced the measurements behind
  [ADR 0014](0014-vector-store-s3-vectors.md). The spike stack is destroyed, nothing imports the
  bench, and its tests run in no recipe.

## Decision

- Delete `infra/gcp/`, its CI validation, the `gcp` option of `deploy-backend.yml` and its
  secrets, and every doc that presented it as an alternative. Google Cloud's only role is the
  OAuth client, documented in [`infra/README.md`](../../../infra/README.md).
- Delete `tools/vector_store_bench/` and `infra/aws/spikes/vector-store/`, with their workspace
  member, lint and type-check entries, CI job and ignore rules. The results stay in
  [`vector-store-spike.md`](../vector-store-spike.md); the code stays in the git history.

## Consequences

- One cloud in `infra/`, one deploy path, and a `tools/` folder that holds only `city_corpus`.
- The GitHub `gcp` environment and the secrets `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
  `GCP_SERVICE_ACCOUNT`, `TF_VAR_db_password` and `TF_VAR_secret_key` are unused and can be
  deleted from the repository settings.
- Rerunning the spike means restoring it from history.
