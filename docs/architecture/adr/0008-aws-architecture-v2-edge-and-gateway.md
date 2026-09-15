# 0008 — AWS architecture v2: CloudFront single origin, API Gateway REST with streaming, private Fargate

**Status:** Proposed
**Date:** 2026-09-15

## Context

The first AWS shape ([ADR 0007](0007-aws-cloud-and-auth.md), `infra/aws/`) puts the two
Fargate services behind a public ALB listening on plain HTTP, in public subnets, and leaves the
frontend on GitHub Pages. Reviewing it against the target sketch ("AWS architecture v2, split
API") surfaced four problems:

1. **HTTPS is not optional.** A frontend served over HTTPS cannot call an `http://` API
   (mixed content is blocked) and Google Sign-In only accepts HTTPS origins. The current ALB has
   no certificate, so the v1 shape cannot serve the real frontend at all.
2. **Two public origins.** Frontend and API on different hosts means CORS configuration, a
   registered OAuth origin per environment and a `NEXT_PUBLIC_API_URL` baked into the build.
3. **The gateway question.** The sketch wants an API gateway (throttling, keys, WAF, one place
   for policies). API Gateway **HTTP APIs** buffer the response and cap the integration at 30 s,
   which breaks the SSE chat. Since November 2025 API Gateway **REST APIs** support response
   streaming (`responseTransferMode = STREAM`): up to 15 minutes, 5-minute idle timeout on
   regional endpoints, works with `HTTP_PROXY` integrations through a VPC Link. VPC Links for
   REST APIs target a **Network** Load Balancer, not an ALB.
4. **Vector store.** The sketch names Kendra, which is a managed enterprise-search product
   (hundreds of euros a month at its smallest size), not a vector database.

The domain (`kirian-world.com`) is administered by a third party, so every DNS record and
certificate validation otherwise goes through them.

## Decision

The target deployment, drawn in [`aws-architecture.drawio.svg`](../aws-architecture.drawio.svg)
(draw.io with the official AWS shape library; the SVG embeds its own source):

- **One public origin: CloudFront.** Default behaviour serves the Next.js static export from a
  **private S3 bucket** (origin access control). A second behaviour forwards `/api/*` to the API
  Gateway with caching disabled and the `Authorization` header forwarded. TLS terminates at
  CloudFront with an ACM certificate issued in `us-east-1`. The frontend calls a relative
  `/api/...` URL, so `NEXT_PUBLIC_API_URL` is empty in this shape and CORS is not involved
  (this narrows [ADR 0003](0003-frontend-two-base-urls.md) to local development and GCP).
- **DNS: a delegated subdomain.** The domain owner adds one NS record delegating
  `travel.<domain>` to a Route 53 hosted zone in our account; from then on records and ACM
  validation are ours.
- **API Gateway REST API, regional**, as the API gateway. Two proxy resources:
  `/api/v1/ai/{proxy+}` with response streaming (SSE chat, 15-minute integration timeout) and
  `/api/v1/{proxy+}` buffered. Both are `HTTP_PROXY` integrations through a **VPC Link** to an
  **internal NLB** with two listeners (`:8000` core-api, `:8001` ai-api) and IP target groups.
  Path routing is the gateway's job; the NLB is only the private tunnel. The ALB is removed.
  JWT validation stays in the services ([ADR 0002](0002-auth-between-services.md)); a Lambda
  authorizer is an option later, not a requirement.
- **Fargate tasks in private subnets**, no public IPs. Egress (Google `tokeninfo`, image pulls,
  Bedrock, Secrets Manager, logs) goes through one NAT Gateway. Security groups: NLB → tasks
  on their port, tasks → RDS on 5432.
- **RDS PostgreSQL stays the only database instance.** `core-api` keeps its database. `ai-api`
  gets a **separate database with `pgvector`** on the same instance, with its own credentials;
  it accesses it through a plain PostgreSQL driver in `infrastructure/`, never SQLAlchemy or
  `core_api` models, so the boundary of [ADR 0001](0001-backend-split.md) holds. Kendra is out.
- **Bedrock as the cloud LLM and embeddings provider**, through a new `LLMProvider` adapter in
  `ai_api/infrastructure/` selected by environment variable; NVIDIA remains the local-dev
  provider. Bedrock authenticates with the task's IAM role, so no API key secret is needed in
  the cloud.
- Unchanged: ECR, Secrets Manager (each service reads only its own secrets), one IAM task role
  per service, CloudWatch Logs, GitHub Actions through OIDC, Terraform state in S3.

## Consequences

- Good: HTTPS everywhere; a single origin for the browser (no CORS, one OAuth origin, a
  relative API URL in the build); a real gateway for throttling, usage plans and WAF; tasks
  unreachable from the internet; SSE streaming preserved end to end (API Gateway REST streaming,
  CloudFront response timeout raised for `/api/*`).
- Bad: more moving parts than v1 (CloudFront, API Gateway, VPC Link, NLB, NAT). Monthly cost
  rises mainly through the NAT Gateway and per-request API Gateway pricing plus streaming; the
  NLB replaces the ALB at a similar price. REST API resources are verbose in Terraform.
- Bad: with `STREAM` there is no endpoint caching, compression or VTL transformation on the AI
  routes; CloudFront's origin response timeout (default 30 s, raisable) must exceed the longest
  pause between chat tokens.
- The frontend leaves GitHub Pages; `deploy.yml` will sync the export to S3 and invalidate
  CloudFront instead.
- Implementation is split into separate issues, in this order: (1) CloudFront + S3 + ACM +
  Route 53; (2) API Gateway REST + VPC Link + NLB, tasks to private subnets, remove the ALB;
  (3) Bedrock adapter; (4) `pgvector` database and the `Retriever` adapter. Until (2) lands,
  `infra/aws/` implements v1 and its README says so. This ADR moves to **Accepted** when (2) is
  applied.
- Revisit if per-request pricing or the NAT cost dominates at low traffic: CloudFront → ALB
  (HTTPS listener) with tasks in public subnets is the cheaper fallback and needs no code change.
