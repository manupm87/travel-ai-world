# Architecture Decision Records

One file per decision, numbered, never deleted (superseded ones get a new status and a pointer).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-backend-split.md) | Split the backend into `core_api` and `ai_api` | Accepted |
| [0002](0002-auth-between-services.md) | Stateless JWT in `ai_api`; forward the user's token to `core_api` | Superseded by 0009 |
| [0003](0003-frontend-two-base-urls.md) | Frontend supports two base URLs; reverse proxy is optional | Accepted |
| [0004](0004-repository-layout.md) | Source under `src/`, infrastructure under `infra/`, one ignore file | Accepted (updated by 0028 and 0038) |
| [0005](0005-trip-aggregate-nested-resources.md) | `Trip` is the aggregate root; child resources are nested and declarative | Accepted (superseded in part by 0019 and 0023) |
| [0006](0006-frontend-trip-view-model.md) | The frontend renders a view model mapped from the backend contract | Accepted (superseded in part by 0019) |
| [0007](0007-aws-cloud-and-auth.md) | AWS is the deployment cloud; SSO locally, OIDC in CI, state in S3 | Accepted (`infra/gcp` removed by 0038) |
| [0008](0008-aws-architecture-v2-edge-and-gateway.md) | AWS v2: CloudFront single origin, API Gateway REST with streaming, private Fargate | Superseded by 0009 |
| [0009](0009-lambda-cognito-budget.md) | AWS v3 on a 30 €/month budget: Lambda instead of Fargate, Cognito for sign-in, no NAT | Accepted (data superseded by 0023; VPC and RDS removed) |
| [0010](0010-domain-roots-in-terraform.md) | The hosted zone and the ACM certificate are Terraform resources, imported and `prevent_destroy` | Accepted |
| [0011](0011-real-trips-seed-and-client-side-loading.md) | Real trips: backend-seeded demo data per account, client-side loading, `/trip/?id=`, Compose mirrors CloudFront | Accepted (superseded in part by 0019 and 0020) |
| 0012 | Reserved for the knowledge base, never written: the corpus contract is [`tools/city_corpus/README.md`](../../../src/backend/tools/city_corpus/README.md#output), the store is ADR 0014 | — |
| [0013](0013-chat-conversations-in-core-api.md) | Chat conversations are stored by `core_api` and written by `ai_api` over HTTP | Superseded by 0027 (storage superseded by 0023 before) |
| [0014](0014-vector-store-s3-vectors.md) | The vector store is Amazon S3 Vectors, filled from the committed corpus | Accepted (its first client, the chat, retired by 0027; amended by 0033) |
| [0015](0015-planner-sse-v2-stateless-orchestration.md) | The planner streams typed events (SSE v2) from a stateless orchestrator in `ai_api` | Accepted (amended by 0025 and 0032) |
| [0016](0016-planner-map-openfreemap-maplibre.md) | The planner's map is MapLibre GL over OpenFreeMap's hosted tiles | Accepted |
| [0017](0017-city-intro-and-hero-in-the-cities-manifest.md) | A city's intro (derived from the corpus) and hero photo (curated) travel in the cities manifest | Accepted |
| [0018](0018-chat-answers-carry-cards-client-names-the-slot.md) | A chat answer's places become cards; the client names the slot | Accepted |
| [0019](0019-trips-live-in-the-planner.md) | Trips live in the planner: one city, a derived phase, a read-only past | Accepted (amended by 0020) |
| [0020](0020-signed-in-home-is-the-trips-page.md) | The signed-in home is the trips page; the planner makes and reads one trip | Accepted |
| [0021](0021-venue-photos-from-the-venues-site-preview.md) | A venue with no photo shows the preview of its own site, never another venue's | Accepted |
| [0022](0022-hotel-photos-resolved-at-build-time.md) | Every hotel has a photo: resolved at build time, or it leaves the corpus | Accepted |
| [0023](0023-dynamodb-data-store.md) | DynamoDB is the data store: one table for `core_api`, one interaction log for `ai_api`, RDS retired | Accepted (amended by 0024; conversations retired by 0027) |
| [0024](0024-turn-traces-and-admin-access.md) | A turn is a trace with steps; admins are the Cognito group, filled from Terraform | Accepted (amended by 0026; the chat retired by 0027) |
| [0025](0025-planner-progress-event.md) | The planner streams its progress: a `progress` event per packing step | Accepted |
| [0026](0026-access-list-and-daily-token-quota.md) | An access list in `core_api` gates the app; a daily token quota per person | Accepted |
| [0027](0027-retire-chat-v1.md) | The chat v1 (`POST /ai/chat` and `core_api`'s conversations) is retired; with it the unused title model, and the user PATCH routes narrow | Accepted |
| [0028](0028-retire-the-legacy-scraper.md) | The legacy scraper leaves the tree; the cities come from `tools/city_corpus` only | Accepted (what it kept, removed by 0038) |
| [0029](0029-provider-native-structured-outputs.md) | Structured planner answers are constrained by the active provider | Accepted |
| [0030](0030-local-business-metrics.md) | Local trip creation business metric | Accepted |
| [0031](0031-production-business-events.md) | Production business statistics from existing application logs | Accepted |
| [0032](0032-kiri-is-a-tool-using-agent.md) | Kiri is a tool-using agent in `ai_api` | Accepted (amends 0015) |
| [0033](0033-city-kb-enhanced-index-mode.md) | `city-kb` filters before it searches (S3 Vectors ENHANCED mode) | Accepted (amends 0014) |
| [0034](0034-native-service-dashboard.md) | Native CloudWatch service dashboard | Accepted |
| [0035](0035-structured-http-access-logs.md) | Structured HTTP access logs before response completion | Accepted |
| [0036](0036-cognito-in-existing-dashboard.md) | Cognito metrics in the existing service dashboard | Accepted |
| [0037](0037-bedrock-in-existing-dashboard.md) | Bedrock metrics in the existing service dashboard | Accepted |
| [0038](0038-retire-gcp-and-the-vector-store-spike.md) | `infra/gcp` and the vector store spike leave the tree | Accepted (amends 0007 and 0028) |

## Inputs

- [Vector store spike](../vector-store-spike.md) — Qdrant as a Lambda measured against
  Amazon S3 Vectors on the Budapest corpus; cross-checks ADR 0014.

## Template

```markdown
# NNNN — Title

**Status:** Proposed | Accepted | Superseded by NNNN
**Date:** YYYY-MM-DD

## Context
What forces are at play; what we observed in the code.

## Decision
What we do, in one or two paragraphs. Concrete: files, names, boundaries.

## Consequences
Good, bad, and what to revisit and when.
```
