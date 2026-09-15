# 0009 — AWS v3 on a 30 €/month budget: Lambda instead of Fargate, Cognito for sign-in, no NAT

**Status:** Accepted (applied 2026-09-15)
**Date:** 2026-09-15

## Context

The project has **60 € for two months** of cloud spend. The v2 target of
[ADR 0008](0008-aws-architecture-v2-edge-and-gateway.md) costs about 55 €/month before any
egress solution (list prices, eu-west-1, 24/7): two Fargate services (~18 €), the NLB the REST
API's VPC Link requires (~18 €), RDS (~15 € unless the free tier applies) and small items. A NAT
Gateway (~35 €) or the five interface VPC endpoints the private subnets would need (~40 €) sit on
top. ECS is not a requirement of the course. Two smaller facts also shaped this decision:

- AWS has no free equivalent of GCP's Private Google Access: without an interface endpoint (paid
  per hour) a service API has no private IP inside the VPC. Only the S3 and DynamoDB gateway
  endpoints are free.
- The backend's only calls to non-AWS hosts are Google's `tokeninfo` (`core_api`) and NVIDIA
  (`ai_api`). Removing both removes every reason for the backend to reach the internet.

## Decision

The same two container images ([ADR 0001](0001-backend-split.md) stands) run on **AWS Lambda**:

- **Compute.** The backend `Dockerfile` adds the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter),
  which proxies Lambda invocations to the FastAPI process, so the services run unchanged locally,
  in Docker Compose and on Lambda. `ai_api` runs with `AWS_LWA_INVOKE_MODE=response_stream` so
  the SSE chat streams end to end. Images stay in ECR; the deploy workflow updates each function
  to the new image digest. Cold starts (1–3 s on a container image) are accepted; no provisioned
  concurrency.
- **Gateway.** API Gateway **REST, regional** (as in ADR 0008), now with Lambda proxy
  integrations: `/api/v1/ai/{proxy+}` in `STREAM` mode (15-minute limit), `/api/v1/{proxy+}`
  buffered. No VPC Link, no NLB.
- **Sign-in: Amazon Cognito user pool with Google as identity provider.** The browser signs in
  through Cognito's managed login on `auth.travel.<domain>` (authorization code + PKCE); Cognito
  does the OAuth exchange with Google. Every API method uses the gateway's **Cognito user pool
  authorizer**. Both services still verify the token themselves: `travel_common` moves from HS256
  with a shared `SECRET_KEY` to RS256 with the pool's JWKS, which Terraform reads at deploy time
  and passes as an environment variable, so no function fetches keys at runtime. `Principal` is
  built from the claims (`sub`, `email`; `admin` is a Cognito group). `core_api` keeps its users
  table (upsert on first request) and its database check for revocation. This supersedes
  [ADR 0002](0002-auth-between-services.md): the user's bearer token is still forwarded from
  `ai_api` to `core_api`, but no secret is shared between services any more.
- **Network.** `core_api` runs **inside the VPC** in private subnets: it needs only RDS. It has no
  route to the internet, no NAT, no endpoints; CloudWatch logging goes through the Lambda service,
  not the VPC. `ai_api` runs **outside the VPC**: it calls Bedrock and calls `core_api` through the
  public API Gateway URL with the caller's token. There are no public subnets, no internet
  gateway for the backend and no load balancer.
- **Configuration.** Secrets (database password, Google client secret for Cognito is held by
  Cognito itself) are KMS-encrypted Lambda environment variables set by Terraform, not Secrets
  Manager, which a VPC without endpoints cannot reach. They are already in the Terraform state,
  which ADR 0007 protects.
- **Data.** RDS PostgreSQL `db.t4g.micro` in the private subnets, one instance, two databases:
  `core` for `core_api` and `ai` with `pgvector` for `ai_api` (own credentials, plain driver, no
  ORM: ADR 0001's boundary). Migrations run from the deploy workflow by invoking the `core_api`
  function with a `migrate` command, since there is no container entrypoint any more.
- **Unchanged from ADR 0008:** CloudFront as the single public origin (private S3 with OAC for
  the static export, `/api/*` to the gateway with caching off and `Authorization` forwarded),
  ACM certificate in `us-east-1`, Bedrock as the cloud LLM and embeddings provider (NVIDIA
  stays for local development), one IAM role per function. The domain's hosted zone lives in
  this account, so no delegation is needed; the zone, the certificate, the bucket and the
  distribution already exist (`infra/aws/frontend.tf`, #83, and the
  [frontend runbook](../../runbooks/frontend-https-aws.md)). What remains on the edge is the
  `/api/*` behaviour towards the gateway.

### Estimated monthly cost (eu-west-1, list prices)

| Item | €/month |
|---|---|
| Lambda ×2 (free tier: 1 M requests, 400 000 GB-s, permanent) | 0 |
| API Gateway REST (3.50 $/M requests + streaming data) | < 1 |
| CloudFront (1 TB/month free), S3, Route 53 hosted zone | ~1 |
| Cognito (10 000 MAU free with social sign-in) | 0 |
| RDS `db.t4g.micro` + 20 GB | ~15, or 0 for 12 months if the account is under a year old |
| ECR, CloudWatch Logs, KMS default key | ~1 |
| Bedrock (pay per token; demo traffic) | 1–3 |
| **Total** | **~4 € with the RDS free tier, ~19 € without** |

The RDS free tier is the swing item; check the account's creation date before the first apply.

## Consequences

- Good: fits the budget with margin; the frontier of the network is exactly what was asked for
  (the backend has no inbound or outbound path except the gateway and the database); no shared
  secret, no Google verification code, no NVIDIA key in the cloud; streaming preserved; the same
  images everywhere.
- Bad: cold starts on the first request after idle; Lambda's 15-minute cap on a chat response;
  local development needs either a real Cognito pool (no official emulator) or the existing
  Google flow kept as a local adapter behind the same `Principal` contract, which is the plan.
- Bad: three code changes before infrastructure can be applied: the Lambda adapter in the
  `Dockerfile` and a `migrate` command; RS256/JWKS verification in `travel_common` and the
  Cognito claims mapping in `core_api`; the frontend's sign-in moves from Google Identity Services
  to Cognito's managed login.
- The frontend has left GitHub Pages for S3 + CloudFront (#83); `deploy.yml` syncs the export
  and invalidates the distribution on every push (TRA-121). The SPA error pages of #83
  (403/404 → `index.html`) had to go: CloudFront applies them to every behaviour, `/api/*`
  included; a CloudFront Function resolves `/route/` to `/route/index.html` instead.
- Health endpoints sit behind the gateway's Cognito authorizer like every other method; the
  functions' own readiness check is internal (Lambda Web Adapter). Revisit if an external
  uptime check is wanted.
- Terraform: `infra/aws/` replaces the ECS/ALB resources with Lambda, API Gateway and Cognito
  and extends the existing CloudFront distribution with the `/api/*` behaviour; `infra/gcp/`
  stays untouched as the documented alternative.
- Order of work, one issue each: (1) Cognito user pool + `travel_common` RS256 + frontend
  sign-in (TRA-119); (2) Lambda Web Adapter + `migrate` command (TRA-120); (3) Terraform v3
  (TRA-121); (4) Bedrock adapter (TRA-122); (5) `pgvector` database and `Retriever` adapter
  (TRA-123). This ADR becomes **Accepted** when (3) is
  applied (done 2026-09-15: PRs #85, #87, #88, #90, #92). ADR 0008 is superseded for compute,
  network and secrets; its CloudFront, gateway, streaming and data decisions carry over here.
- Found on the real account, not in the design: the distribution created by hand in #83 sits on
  CloudFront's Free pricing plan (only `PriceClass_All`) and carries a console-attached WAF web
  ACL (three managed rule groups, roughly 8 $/month) that Terraform ignores; keeping it is a
  separate budget decision. Backend images must be single-platform manifests (the build sets
  `provenance: false`).
- Revisit if traffic grows past the free tiers or if ECS becomes a requirement: the v2 shape
  (ADR 0008) is the documented path back, at ~55 €/month.
