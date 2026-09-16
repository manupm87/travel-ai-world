# Architecture Decision Records

One file per decision, numbered, never deleted (superseded ones get a new status and a pointer).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-backend-split.md) | Split the backend into `core_api` and `ai_api` | Accepted |
| [0002](0002-auth-between-services.md) | Stateless JWT in `ai_api`; forward the user's token to `core_api` | Superseded by 0009 |
| [0003](0003-frontend-two-base-urls.md) | Frontend supports two base URLs; reverse proxy is optional | Accepted |
| [0004](0004-repository-layout.md) | Source under `src/`, infrastructure under `infra/`, one ignore file | Accepted |
| [0005](0005-trip-aggregate-nested-resources.md) | `Trip` is the aggregate root; child resources are nested and declarative | Accepted |
| [0006](0006-frontend-trip-view-model.md) | The frontend renders a view model mapped from the backend contract | Accepted |
| [0007](0007-aws-cloud-and-auth.md) | AWS is the deployment cloud; SSO locally, OIDC in CI, state in S3 | Accepted |
| [0008](0008-aws-architecture-v2-edge-and-gateway.md) | AWS v2: CloudFront single origin, API Gateway REST with streaming, private Fargate | Superseded by 0009 |
| [0009](0009-lambda-cognito-budget.md) | AWS v3 on a 30 €/month budget: Lambda instead of Fargate, Cognito for sign-in, no NAT | Accepted |
| [0010](0010-domain-roots-in-terraform.md) | The hosted zone and the ACM certificate are Terraform resources, imported and `prevent_destroy` | Accepted |
| [0011](0011-real-trips-seed-and-client-side-loading.md) | Real trips: backend-seeded demo data per account, client-side loading, `/trip/?id=`, Compose mirrors CloudFront | Accepted |

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
